/**
 * XML-based tool calling utilities for models without native function calling support.
 *
 * This module provides:
 * - XML tool prompt generation (converting tool schemas to XML format in system prompt)
 * - XML tool call parsing (extracting tool calls from model responses)
 *
 * Based on the approach used by kilocode and the vscode-extension implementation.
 */

/**
 * Counter for generating unique tool call IDs.
 */
let toolCallIdCounter = 0;

/**
 * Tool definition compatible with AI SDK's LanguageModelV1
 */
export interface ToolDefinition {
    type: "function";
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
}

/**
 * Parsed tool call result
 */
export interface ParsedToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

/**
 * Options for XML tool call parsing.
 */
export interface XmlToolParseOptions {
    /**
     * When true, trims leading/trailing whitespace from parameter values.
     * Default is false (whitespace is preserved).
     */
    trimParameterWhitespace?: boolean;
}

/**
 * Generates XML-based tool calling system prompt instructions.
 *
 * @param tools - Array of tool definitions to convert
 * @returns System prompt text describing how to use tools in XML format
 */
export function generateXmlToolPrompt(tools: ToolDefinition[]): string {
    if (!tools || tools.length === 0) {
        return "";
    }

    const toolDescriptions = tools
        .map((tool) => formatToolDescription(tool))
        .filter(Boolean)
        .join("\n\n");

    if (!toolDescriptions) {
        return "";
    }

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

## Special Characters

When parameter values contain XML special characters, escape them as follows:
- \`&\` → \`&amp;\`
- \`<\` → \`&lt;\`
- \`>\` → \`&gt;\`
- \`"\` → \`&quot;\`
- \`'\` → \`&apos;\`

For example: \`<content>x &lt; y &amp;&amp; z &gt; w</content>\`

You may optionally include a \`callId\` parameter to identify each tool call. This is useful when making multiple calls to the same tool:

<tool_name>
<callId>unique_id_here</callId>
<parameter1_name>value1</parameter1_name>
</tool_name>

If \`callId\` is omitted, one will be automatically generated.

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
6. After tool execution, results will be provided in XML format: <tool_name_result>...</tool_name_result>. Use these results to continue your task or make further decisions.
7. If no tool is needed, you may respond with text only.

IMPORTANT: Keep your tool call as a well-formed XML block that can be parsed without any text interleaved inside the tags. You may include brief natural language instructions or explanations before or after the XML tool call if helpful, but do not break the XML structure.`;
}

/**
 * Formats a single tool definition into an XML description.
 */
function formatToolDescription(tool: ToolDefinition): string {
    const name = tool.name?.trim();
    if (!name) {
        return "";
    }

    const description = tool.description?.trim() || "";
    const parameters = formatParameters(tool.parameters);

    const parts: string[] = [`## ${name}`];
    if (description) {
        parts.push(`Description: ${description}`);
    }
    parts.push(parameters ? `Parameters:\n${parameters}` : "Parameters: None");
    parts.push(`
Usage:
<${name}>
${generateParameterExample(tool.parameters)}
</${name}>`);

    return parts.join("\n");
}

/**
 * Formats the parameters section from a JSON schema
 */
function formatParameters(schema: Record<string, unknown> | undefined): string {
    if (!schema) {
        return "";
    }

    const properties = schema.properties as
        | Record<string, { type?: string; description?: string }>
        | undefined;
    const required = (schema.required as string[]) || [];

    if (!properties || Object.keys(properties).length === 0) {
        return "";
    }

    const paramLines: string[] = [];
    for (const [paramName, paramDef] of Object.entries(properties)) {
        const isRequired = required.includes(paramName);
        const requiredStr = isRequired ? "(required)" : "(optional)";
        const typeStr = paramDef.type ? ` [${paramDef.type}]` : "";
        const descStr = paramDef.description ? `: ${paramDef.description}` : "";
        paramLines.push(`- ${paramName}${typeStr} ${requiredStr}${descStr}`);
    }

    return paramLines.join("\n");
}

/**
 * Generates an example usage with parameter placeholders
 */
function generateParameterExample(
    schema: Record<string, unknown> | undefined,
): string {
    if (!schema) {
        return "<!-- No parameters required -->";
    }

    const properties = schema.properties as
        | Record<string, { type?: string }>
        | undefined;

    if (!properties || Object.keys(properties).length === 0) {
        return "<!-- No parameters required -->";
    }

    const lines: string[] = [];
    for (const [paramName, paramDef] of Object.entries(properties)) {
        const placeholder = getPlaceholder(paramName, paramDef.type);
        lines.push(`<${paramName}>${placeholder}</${paramName}>`);
    }

    return lines.join("\n");
}

/**
 * Gets a placeholder value for a parameter based on its type
 */
function getPlaceholder(paramName: string, type?: string): string {
    switch (type) {
        case "number":
        case "integer":
            return "0";
        case "boolean":
            return "true";
        case "array":
            return "[]";
        case "object":
            return "{}";
        case "string":
        default:
            return `{${paramName}}`;
    }
}

/**
 * Escapes special characters for use in a regular expression.
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parses XML tool calls from model response text.
 *
 * @param text - The model response text that may contain XML tool calls
 * @param availableTools - List of available tool names to look for
 * @param options - Optional parsing options
 * @returns Array of parsed tool calls with their names and arguments
 */
export function parseXmlToolCalls(
    text: string,
    availableTools: string[],
    options: XmlToolParseOptions = {},
): ParsedToolCall[] {
    const toolCalls: ParsedToolCall[] = [];

    const toolPatterns = availableTools.map((toolName) => ({
        name: toolName,
        regex: new RegExp(
            `<${escapeRegex(toolName)}>([\\s\\S]*?)<\\/${escapeRegex(toolName)}>`,
            "g",
        ),
    }));

    for (const { name: toolName, regex } of toolPatterns) {
        let match;

        while ((match = regex.exec(text)) !== null) {
            const content = match[1];
            const args = parseXmlParameters(content, options);

            let callId: string;
            if (typeof args.callId === "string" && args.callId.trim()) {
                callId = args.callId.trim();
                delete args.callId;
            } else {
                callId = generateToolCallId();
            }

            toolCalls.push({
                id: callId,
                name: toolName,
                arguments: args,
            });
        }
    }

    return toolCalls;
}

/**
 * Parses XML parameters from the content inside a tool tag.
 */
function parseXmlParameters(
    content: string,
    options: XmlToolParseOptions = {},
): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    const trimWhitespace = options.trimParameterWhitespace ?? false;

    const paramRegex = /<([a-zA-Z_][a-zA-Z0-9_-]*)>([\s\S]*?)<\/\1>/g;
    let match;

    while ((match = paramRegex.exec(content)) !== null) {
        const paramName = match[1];
        const paramValue = trimWhitespace ? match[2].trim() : match[2];

        const openTag = `<${paramName}>`;
        const closeTag = `</${paramName}>`;
        if (paramValue.includes(openTag) || paramValue.includes(closeTag)) {
            continue; // Skip malformed nested parameters
        }

        const unescapedValue = unescapeXml(paramValue);

        try {
            args[paramName] = JSON.parse(unescapedValue);
        } catch {
            args[paramName] = unescapedValue;
        }
    }

    return args;
}

/**
 * Generates a unique tool call ID.
 */
function generateToolCallId(): string {
    toolCallIdCounter += 1;
    const timestampPart = Date.now().toString(36);
    const counterPart = toolCallIdCounter.toString(36);
    const randomPart = Math.random().toString(36).slice(2, 11);
    return `call_xml_${timestampPart}_${counterPart}_${randomPart}`;
}

/**
 * Escapes XML special characters in a string.
 */
export function escapeXml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/**
 * Unescapes XML entities back to their original characters.
 */
function unescapeXml(str: string): string {
    return str
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}

/**
 * Formats a tool call as XML text.
 */
export function formatToolCallAsXml(
    name: string,
    args: Record<string, unknown>,
): string {
    const paramLines = Object.entries(args).map(([key, value]) => {
        const stringValue =
            typeof value === "string" ? value : JSON.stringify(value);
        const escapedValue = escapeXml(stringValue);
        return `<${key}>${escapedValue}</${key}>`;
    });

    return `<${name}>\n${paramLines.join("\n")}\n</${name}>`;
}

/**
 * Formats a tool result as text.
 */
export function formatToolResultAsText(
    toolName: string,
    result: string,
): string {
    return `<${toolName}_result>\n${result}\n</${toolName}_result>`;
}
