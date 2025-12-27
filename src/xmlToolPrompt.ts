import * as vscode from 'vscode';
import { escapeRegex } from './configUtils';

/**
 * Counter for generating unique tool call IDs within a session.
 */
let toolCallIdCounter = 0;

/**
 * Generates XML-based tool calling system prompt instructions.
 * This is based on the approach used by kilocode (https://github.com/Kilo-Org/kilocode/)
 * where tools are described in the system prompt using XML format instead of native function calling.
 * 
 * @param tools - Array of tool definitions to convert
 * @returns System prompt text describing how to use tools in XML format
 */
export function generateXmlToolPrompt(tools: readonly vscode.LanguageModelChatTool[]): string {
    if (!tools || tools.length === 0) {
        return '';
    }

    // Tools without valid names return '' from formatToolDescription and are filtered out by .filter(Boolean)
    const toolDescriptions = tools.map(tool => formatToolDescription(tool)).filter(Boolean).join('\n\n');

    return `====

TOOL USE

You have access to a set of tools that are executed upon the user's approval. You can use zero or more tools per message depending on what the task requires. For independent operations, you can call up to 5 tools in a single message. The results of all tool calls will be returned together after execution.

# Tool Use Formatting

Tool uses are formatted using XML-style tags. The tool name itself becomes the XML tag name. Each parameter is enclosed within its own set of tags. Here's the structure:

<actual_tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
...
</actual_tool_name>

Always use the actual tool name as the XML tag name for proper parsing and execution.

## Multiple Tool Calls

When you need to perform multiple independent operations, you can include multiple tool calls in a single message (up to 5 at once). All tools will be executed and their results returned together:

<tool_name_1>
<param>value</param>
</tool_name_1>

<tool_name_2>
<param>value</param>
</tool_name_2>

# Available Tools

${toolDescriptions}

# Tool Use Guidelines

1. In <thinking> tags, assess what information you already have and what information you need to proceed with the task.
2. Choose the most appropriate tool(s) based on the task and the tool descriptions provided.
3. For independent operations that don't depend on each other's results, you can call up to 5 tools in a single message for efficiency.
4. For dependent operations where one tool's result is needed for the next, use tools step-by-step with each use informed by the previous result.
5. Formulate your tool use using the XML format specified for each tool.
6. After tool execution, the user will respond with the results of all tool calls. Use these results to continue your task or make further decisions.
7. If no tool is needed, you may respond with text only.

IMPORTANT: Keep your tool call as a well-formed XML block that can be parsed without any text interleaved inside the tags. You may include brief natural language instructions or explanations before or after the XML tool call if helpful, but do not break the XML structure.`;
}

/**
 * Formats a single tool definition into an XML description.
 * Returns an empty string for tools without valid names (filtered in generateXmlToolPrompt).
 */
function formatToolDescription(tool: vscode.LanguageModelChatTool): string {
    const name = (tool.name ?? '').trim();
    if (!name) {
        return '';
    }

    const description = (tool.description ?? '').trim();
    const schema = tool.inputSchema as Record<string, unknown> | undefined;
    const parameters = formatParameters(schema);

    // Build parts array for this tool
    const parts: string[] = [`## ${name}`];
    if (description) {
        parts.push(`Description: ${description}`);
    }
    parts.push(parameters ? `Parameters:\n${parameters}` : 'Parameters: None');
    parts.push(`
Usage:
<${name}>
${generateParameterExample(schema)}
</${name}>`);

    return parts.join('\n');
}

/**
 * Formats the parameters section from a JSON schema
 */
function formatParameters(schema: Record<string, unknown> | undefined): string {
    if (!schema) {
        return '';
    }

    const properties = schema.properties as Record<string, { type?: string; description?: string }> | undefined;
    const required = (schema.required as string[]) || [];

    if (!properties || Object.keys(properties).length === 0) {
        return '';
    }

    const paramLines: string[] = [];
    for (const [paramName, paramDef] of Object.entries(properties)) {
        const isRequired = required.includes(paramName);
        const requiredStr = isRequired ? '(required)' : '(optional)';
        const typeStr = paramDef.type ? ` [${paramDef.type}]` : '';
        const descStr = paramDef.description ? `: ${paramDef.description}` : '';
        paramLines.push(`- ${paramName}${typeStr} ${requiredStr}${descStr}`);
    }

    return paramLines.join('\n');
}

/**
 * Generates an example usage with parameter placeholders
 */
function generateParameterExample(schema: Record<string, unknown> | undefined): string {
    if (!schema) {
        return '<!-- No parameters required -->';
    }

    const properties = schema.properties as Record<string, { type?: string }> | undefined;

    if (!properties || Object.keys(properties).length === 0) {
        return '<!-- No parameters required -->';
    }

    const lines: string[] = [];
    for (const [paramName, paramDef] of Object.entries(properties)) {
        const placeholder = getPlaceholder(paramName, paramDef.type);
        lines.push(`<${paramName}>${placeholder}</${paramName}>`);
    }

    return lines.join('\n');
}

/**
 * Gets a placeholder value for a parameter based on its type
 */
function getPlaceholder(paramName: string, type?: string): string {
    switch (type) {
        case 'number':
        case 'integer':
            return '0';
        case 'boolean':
            return 'true';
        case 'array':
            return '[]';
        case 'object':
            return '{}';
        case 'string':
        default:
            return `{${paramName}}`;
    }
}

/**
 * Parses XML tool calls from model response text.
 * Uses case-sensitive matching for tool names.
 * 
 * @param text - The model response text that may contain XML tool calls
 * @param availableTools - List of available tool names to look for
 * @returns Array of parsed tool calls with their names and arguments
 */
export function parseXmlToolCalls(text: string, availableTools: string[]): ParsedToolCall[] {
    const toolCalls: ParsedToolCall[] = [];
    
    // Pre-compute regex patterns for all tools for efficiency
    const toolPatterns = availableTools.map(toolName => ({
        name: toolName,
        regex: new RegExp(`<${escapeRegex(toolName)}>([\\s\\S]*?)<\\/${escapeRegex(toolName)}>`, 'g'),
    }));
    
    for (const { name: toolName, regex } of toolPatterns) {
        let match;
        
        while ((match = regex.exec(text)) !== null) {
            const content = match[1];
            const args = parseXmlParameters(content);
            
            toolCalls.push({
                id: generateToolCallId(),
                name: toolName,
                arguments: args
            });
        }
    }
    
    return toolCalls;
}

/**
 * Parses XML parameters from the content inside a tool tag.
 * Note: This simple regex does not support nested tags with the same name.
 */
function parseXmlParameters(content: string): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    
    // Match parameter tags: <param_name>value</param_name>
    // Note: This regex uses a backreference (\1) to match closing tags.
    // It does not handle nested tags with the same name correctly.
    const paramRegex = /<([a-zA-Z_][a-zA-Z0-9_]*)>([\s\S]*?)<\/\1>/g;
    let match;
    
    while ((match = paramRegex.exec(content)) !== null) {
        const paramName = match[1];
        const paramValue = match[2].trim();
        
        // Skip malformed nested parameters with the same name to avoid incorrect parsing
        // e.g. <param><param>value</param></param>
        // Use simple string search for efficiency instead of creating new RegExp
        const openTag = `<${paramName}>`;
        const closeTag = `</${paramName}>`;
        if (paramValue.includes(openTag) || paramValue.includes(closeTag)) {
            console.debug('[oai2lmapi] Skipping malformed nested parameter', { paramName, paramValue });
            continue;
        }
        
        // Try to parse as JSON first, otherwise use as string
        try {
            args[paramName] = JSON.parse(paramValue);
        } catch (error) {
            console.debug('[oai2lmapi] Failed to parse XML parameter as JSON', {
                paramName,
                paramValue,
                error
            });
            args[paramName] = paramValue;
        }
    }
    
    return args;
}

/**
 * Generates a unique tool call ID using timestamp, counter, and random component.
 */
function generateToolCallId(): string {
    toolCallIdCounter += 1;
    const timestampPart = Date.now().toString(36);
    const counterPart = toolCallIdCounter.toString(36);
    const randomPart = Math.random().toString(36).slice(2, 11);
    return `call_xml_${timestampPart}_${counterPart}_${randomPart}`;
}

/**
 * Formats a tool call as XML text for message history.
 * Used when converting assistant messages with tool calls to plain text format
 * for prompt-based tool calling.
 * 
 * @param name - The tool name
 * @param args - The tool arguments object
 * @returns XML-formatted tool call string
 */
export function formatToolCallAsXml(name: string, args: Record<string, unknown>): string {
    const paramLines = Object.entries(args).map(([key, value]) => {
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        return `<${key}>${stringValue}</${key}>`;
    });
    
    return `<${name}>\n${paramLines.join('\n')}\n</${name}>`;
}

/**
 * Formats a tool result as text for message history.
 * Used when converting tool result messages to plain text format
 * for prompt-based tool calling, following kilocode's approach.
 * 
 * @param toolName - The name of the tool that was called
 * @param result - The tool result content
 * @returns Formatted tool result text
 */
export function formatToolResultAsText(toolName: string, result: string): string {
    return `[${toolName} Result]\n${result}`;
}

/**
 * Parsed tool call result
 */
export interface ParsedToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}
