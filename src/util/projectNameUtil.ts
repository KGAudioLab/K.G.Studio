/**
 * Allowed characters for project names: letters, numbers, space, hyphen, underscore, period, parentheses.
 * These are safe across Windows, macOS, and Linux as directory names.
 */
const VALID_PROJECT_NAME_REGEX = /^[a-zA-Z0-9 \-_.()\u00C0-\u024F]+$/;

/**
 * Characters that are NOT allowed in project names — replaced during sanitization.
 */
const DISALLOWED_CHARS_REGEX = /[^a-zA-Z0-9 \-_.()\u00C0-\u024F]/g;

/**
 * Validate whether a project name contains only allowed characters.
 * Does NOT check for empty string — caller should check that separately.
 */
export function isValidProjectName(name: string): boolean {
  if (!name || name.trim().length === 0) return false;
  if (name.startsWith('.')) return false; // hidden files on Unix
  return VALID_PROJECT_NAME_REGEX.test(name);
}

/**
 * Sanitize a project name by replacing disallowed characters with underscores,
 * collapsing consecutive underscores/spaces, and trimming.
 */
export function sanitizeProjectName(name: string): string {
  let sanitized = name.replace(DISALLOWED_CHARS_REGEX, '_');

  // Collapse consecutive underscores
  sanitized = sanitized.replace(/_{2,}/g, '_');

  // Collapse consecutive spaces
  sanitized = sanitized.replace(/ {2,}/g, ' ');

  // Trim leading/trailing whitespace, underscores, and dots
  sanitized = sanitized.replace(/^[.\s_]+|[.\s_]+$/g, '').trim();

  // If everything was stripped, provide a fallback
  if (sanitized.length === 0) {
    sanitized = 'Untitled Project';
  }

  return sanitized;
}
