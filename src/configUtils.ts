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
     * When true, suppress chain-of-thought transmission for matching models.
     * See `oai2lmapi.suppressChainOfThought` for exact behavior.
     */
    suppressChainOfThought?: boolean;
}

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
    const regexPattern = escapeRegex(pattern).replace(/\\\*/g, '.*');
    return new RegExp(`^${regexPattern}$`, 'i');
}

/**
 * Gets model override configuration for a given model ID from VSCode settings.
 * Supports wildcard patterns like 'gpt-*' with case-insensitive matching.
 * 
 * @param modelId - The model ID to look up
 * @returns The model override configuration if found, undefined otherwise
 */
export function getModelOverride(modelId: string): ModelOverrideConfig | undefined {
    const config = vscode.workspace.getConfiguration('oai2lmapi');
    const overrides = config.get<Record<string, ModelOverrideConfig>>('modelOverrides', {});
    
    // Check for exact match first
    if (overrides[modelId]) {
        return overrides[modelId];
    }
    
    // Check for wildcard patterns (case-insensitive)
    for (const pattern of Object.keys(overrides)) {
        if (pattern.includes('*')) {
            const regex = wildcardPatternToRegex(pattern);
            if (regex.test(modelId)) {
                return overrides[pattern];
            }
        }
    }
    
    return undefined;
}
