/**
 * Utility functions for JSON Schema manipulation.
 */

/**
 * Recursively strip $schema field from JSON schema objects.
 * Gemini API doesn't accept $schema field in function parameters.
 */
export function stripSchemaField(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (key === '$schema') {
            continue;
        }
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            result[key] = stripSchemaField(value as Record<string, unknown>);
        } else if (Array.isArray(value)) {
            result[key] = value.map(item => {
                if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
                    return stripSchemaField(item as Record<string, unknown>);
                }
                return item;
            });
        } else {
            result[key] = value;
        }
    }
    return result;
}
