/**
 * Glob pattern matching utilities
 */

/**
 * Result of glob pattern validation
 */
export interface GlobValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Expands brace patterns like {a,b,c} into multiple patterns
 * @param pattern - Pattern potentially containing braces
 * @returns Array of expanded patterns
 */
function expandBraces(pattern: string): string[] {
  const braceStart = pattern.indexOf('{');
  if (braceStart === -1) {
    return [pattern];
  }

  const braceEnd = pattern.indexOf('}', braceStart);
  if (braceEnd === -1) {
    return [pattern];
  }

  const prefix = pattern.slice(0, braceStart);
  const suffix = pattern.slice(braceEnd + 1);
  const options = pattern.slice(braceStart + 1, braceEnd).split(',');

  const results: string[] = [];
  for (const option of options) {
    const expanded = expandBraces(prefix + option + suffix);
    results.push(...expanded);
  }
  return results;
}

/**
 * Converts a simple glob pattern to a regular expression
 * Supports: *, ?, [abc], **, {a,b,c}
 * @param pattern - Glob pattern string
 * @returns RegExp for matching
 */
export function globToRegex(pattern: string): RegExp {
  if (pattern === '') {
    return /^.*$/;
  }

  // Expand braces first
  const patterns = expandBraces(pattern);
  if (patterns.length > 1) {
    const regexes = patterns.map((p) => globToRegexSingle(p).source.slice(1, -1)); // Remove ^ and $
    return new RegExp(`^(${regexes.join('|')})$`, 'i');
  }

  return globToRegexSingle(pattern);
}

/**
 * Converts a single glob pattern (no braces) to a regular expression
 * @param pattern - Glob pattern string
 * @returns RegExp for matching
 */
function globToRegexSingle(pattern: string): RegExp {
  let regexStr = '';
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // ** matches any path including separators
        regexStr += '.*';
        i += 2;
        // Skip optional following slash
        if (pattern[i] === '/') {
          i++;
        }
      } else {
        // * matches anything except path separator
        regexStr += '[^/]*';
        i++;
      }
    } else if (char === '?') {
      // ? matches single character except separator
      regexStr += '[^/]';
      i++;
    } else if (char === '[') {
      // Character class
      const closeIndex = pattern.indexOf(']', i);
      if (closeIndex === -1) {
        regexStr += '\\[';
        i++;
      } else {
        const charClass = pattern.slice(i, closeIndex + 1);
        regexStr += charClass;
        i = closeIndex + 1;
      }
    } else if (char === '.') {
      regexStr += '\\.';
      i++;
    } else if (char === '/') {
      regexStr += '/';
      i++;
    } else {
      // Escape other special regex characters
      regexStr += char?.replace(/[\\^$+{}|()]/g, '\\$&') ?? '';
      i++;
    }
  }

  return new RegExp(`^${regexStr}$`, 'i');
}

/**
 * Tests if a filename matches a glob pattern
 * @param filename - File name to test
 * @param pattern - Glob pattern to match against
 * @returns true if filename matches pattern
 */
export function matchesGlob(filename: string, pattern: string): boolean {
  const regex = globToRegex(pattern);
  return regex.test(filename);
}

/**
 * Validates a glob pattern for syntax errors
 * @param pattern - Pattern to validate
 * @returns Validation result with error message if invalid
 */
export function validateGlobPattern(pattern: string): GlobValidationResult {
  if (pattern === '') {
    return { isValid: true };
  }

  // Check for unclosed brackets
  let bracketDepth = 0;
  for (const char of pattern) {
    if (char === '[') {
      bracketDepth++;
    }
    if (char === ']') {
      bracketDepth--;
    }
  }

  if (bracketDepth !== 0) {
    return {
      isValid: false,
      error: 'Unclosed bracket in pattern',
    };
  }

  return { isValid: true };
}
