import * as vscode from 'vscode';

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

    const toolDescriptions = tools.map(tool => formatToolDescription(tool)).filter(Boolean).join('\n\n');

    return `====

TOOL USE

You have access to a set of tools that are executed upon the user's approval. You can use up to 5 tools in a single message when the tasks are independent and can be executed in parallel. The results of all tool calls will be returned together after execution.

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

IMPORTANT: Do not include any text or explanation after your tool calls. The tool call(s) must be the final part of your response.`;
}

/**
 * Formats a single tool definition into an XML description
 */
function formatToolDescription(tool: vscode.LanguageModelChatTool): string {
    const name = (tool.name ?? '').trim();
    if (!name) {
        return '';
    }

    const description = (tool.description ?? '').trim();
    const schema = tool.inputSchema as Record<string, unknown> | undefined;
    const parameters = formatParameters(schema);

    // Build parts array and filter empty ones to avoid blank lines
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
 * 
 * @param text - The model response text that may contain XML tool calls
 * @param availableTools - List of available tool names to look for
 * @returns Array of parsed tool calls with their names and arguments
 */
export function parseXmlToolCalls(text: string, availableTools: string[]): ParsedToolCall[] {
    const toolCalls: ParsedToolCall[] = [];
    
    for (const toolName of availableTools) {
        const regex = new RegExp(`<${escapeRegex(toolName)}>([\\s\\S]*?)<\\/${escapeRegex(toolName)}>`, 'gi');
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
 * Parses XML parameters from the content inside a tool tag
 */
function parseXmlParameters(content: string): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    
    // Match parameter tags: <param_name>value</param_name>
    const paramRegex = /<([a-zA-Z_][a-zA-Z0-9_]*)>([\s\S]*?)<\/\1>/g;
    let match;
    
    while ((match = paramRegex.exec(content)) !== null) {
        const paramName = match[1];
        const paramValue = match[2].trim();
        
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
 * Escapes special regex characters in a string
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generates a unique tool call ID
 */
function generateToolCallId(): string {
    return `call_xml_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Parsed tool call result
 */
export interface ParsedToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}
