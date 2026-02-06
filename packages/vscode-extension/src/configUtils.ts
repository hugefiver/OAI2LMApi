import * as vscode from 'vscode';

/**
 * Model override configuration from user settings.
 * This interface mirrors the `oai2lmapi.modelOverrides` schema in package.json.
 */
export interface ModelOverrideConfig {
    maxInputTokens?: number;
    maxOutputTokens?: number;
    supportsToolCalling?: boolean;
    supportsImageInput?: boolean;
    /**
     * Default temperature for matching models.
     */
    temperature?: number;
    /**
     * Thinking level: number for token budget, or 'low'/'medium'/'high'/'auto'/'none'.
     */
    thinkingLevel?: string | number;
    /**
     * When enabled, tools are converted to XML-format instructions in the system prompt
     * instead of using native function calling.
     */
    usePromptBasedToolCalling?: boolean;

    /**
     * When true, use the OpenAI Responses API for matching models in the OpenAI channel.
     * When false, force the legacy Chat Completions API for matching models.
     */
    useResponsesApi?: boolean;

    /**
     * When true, suppress chain-of-thought transmission for matching models.
     * See `oai2lmapi.suppressChainOfThought` for exact behavior.
     */
    suppressChainOfThought?: boolean;

    /**
     * When true, trims leading/trailing whitespace from XML tool call parameter values.
     * Default is false (whitespace is preserved).
     */
    trimXmlToolParameterWhitespace?: boolean;
}

export type ModelOverrideMap = Record<string, ModelOverrideConfig>;

export type ChannelModelOverrides = Record<string, ModelOverrideMap>;

/**
 * Escapes special regex characters in a string.
 */
export function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Converts a wildcard pattern (e.g., 'gpt-*') into a RegExp.
 * Wildcard '*' matches any sequence of characters. Matching is case-insensitive.
 */
export function wildcardPatternToRegex(pattern: string): RegExp {
    const regexPattern = escapeRegex(pattern)
        .replace(/\\\*/g, '.*')
        .replace(/\\\?/g, '.');
    return new RegExp(`^${regexPattern}$`, 'i');
}

function isWildcardPattern(pattern: string): boolean {
    return pattern.includes('*') || pattern.includes('?');
}

function matchesModelPattern(modelId: string, pattern: string): boolean {
    if (pattern === modelId) {
        return true;
    }
    if (!isWildcardPattern(pattern)) {
        return false;
    }
    const regex = wildcardPatternToRegex(pattern);
    return regex.test(modelId);
}

function collectMatchingOverrides(modelId: string, overrides: ModelOverrideMap): ModelOverrideConfig[] {
    const matches: ModelOverrideConfig[] = [];
    for (const [pattern, override] of Object.entries(overrides)) {
        if (matchesModelPattern(modelId, pattern)) {
            matches.push(override);
        }
    }
    return matches;
}

/**
 * Gets model override configuration for a given model ID from VSCode settings.
 * Supports wildcard patterns like 'gpt-*' with case-insensitive matching.
 * 
 * @param modelId - The model ID to look up
 * @returns The model override configuration if found, undefined otherwise
 */
export function getModelOverride(modelId: string, channel?: string): ModelOverrideConfig | undefined {
    const config = vscode.workspace.getConfiguration('oai2lmapi');
    const globalOverrides = config.get<ModelOverrideMap>('modelOverrides', {});
    const channelOverrides = config.get<ChannelModelOverrides>('channelModelOverrides', {});

    const mergedOverrides: ModelOverrideConfig[] = [];
    mergedOverrides.push(...collectMatchingOverrides(modelId, globalOverrides));
    if (channel && channelOverrides[channel]) {
        mergedOverrides.push(...collectMatchingOverrides(modelId, channelOverrides[channel]));
    }

    if (mergedOverrides.length === 0) {
        return undefined;
    }

    return mergedOverrides.reduce<ModelOverrideConfig>((acc, override) => ({
        ...acc,
        ...override
    }), {});
}
