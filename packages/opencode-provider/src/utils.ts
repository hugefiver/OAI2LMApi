/**
 * Utility to match model IDs against wildcard patterns
 */

/**
 * Convert a wildcard pattern to a RegExp
 * Supports: * (any characters), ? (single character)
 */
export function wildcardToRegex(pattern: string): RegExp {
  // Escape special regex characters except * and ?
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // Convert * to .* and ? to .
  const regex = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${regex}$`, 'i');
}

/**
 * Check if a model ID matches a wildcard pattern
 */
export function matchesWildcard(modelId: string, pattern: string): boolean {
  const regex = wildcardToRegex(pattern);
  return regex.test(modelId);
}

/**
 * Find the most specific matching pattern for a model ID
 * More specific = longer literal prefix before wildcard
 */
export function findBestMatch(
  modelId: string,
  patterns: string[]
): string | undefined {
  const matches = patterns.filter((p) => matchesWildcard(modelId, p));
  
  if (matches.length === 0) {
    return undefined;
  }
  
  // Sort by specificity: longer patterns are more specific
  // Also prioritize patterns without wildcards
  matches.sort((a, b) => {
    const aHasWildcard = a.includes('*') || a.includes('?');
    const bHasWildcard = b.includes('*') || b.includes('?');
    
    if (!aHasWildcard && bHasWildcard) return -1;
    if (aHasWildcard && !bHasWildcard) return 1;
    
    return b.length - a.length;
  });
  
  return matches[0];
}
