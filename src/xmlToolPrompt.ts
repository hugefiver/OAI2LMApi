import * as vscode from 'vscode';

/**
 * Interface for a tool definition that can be converted to XML format
 */
interface ToolDefinition {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
}

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

    const toolDescriptions = tools.map(tool => formatToolDescription(tool)).join('\n\n');

    return `====

TOOL USE

You have access to a set of tools that are executed upon the user's approval. You must use exactly one tool per message, and every assistant message must include a tool call. You use tools step-by-step to accomplish a given task, with each tool use informed by the result of the previous tool use.

# Tool Use Formatting

Tool uses are formatted using XML-style tags. The tool name itself becomes the XML tag name. Each parameter is enclosed within its own set of tags. Here's the structure:

<actual_tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
...
</actual_tool_name>

Always use the actual tool name as the XML tag name for proper parsing and execution.

# Available Tools

${toolDescriptions}

# Tool Use Guidelines

1. In <thinking> tags, assess what information you already have and what information you need to proceed with the task.
2. Choose the most appropriate tool based on the task and the tool descriptions provided.
3. If multiple actions are needed, use one tool at a time per message to accomplish the task iteratively, with each tool use being informed by the result of the previous tool use.
4. Formulate your tool use using the XML format specified for each tool.
5. After each tool use, the user will respond with the result of that tool use. This result will provide you with the necessary information to continue your task or make further decisions.

IMPORTANT: Do not include any text or explanation after your tool call. The tool call must be the final part of your response.`;
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

    return `## ${name}
${description ? `Description: ${description}` : ''}
${parameters ? `Parameters:\n${parameters}` : 'Parameters: None'}

Usage:
<${name}>
${generateParameterExample(schema)}
</${name}>`;
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
        } catch {
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
