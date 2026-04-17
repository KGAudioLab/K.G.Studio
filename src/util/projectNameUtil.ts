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
 * The reserved project name used for unsaved/new projects.
 * Users cannot rename a project to this name, and its OPFS folder is wiped on every startup.
 */
export const RESERVED_PROJECT_NAME = "Untitled Project";

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
 * Returns true if the given name matches the reserved "Untitled Project" name.
 */
export function isReservedProjectName(name: string): boolean {
  return name.trim() === RESERVED_PROJECT_NAME;
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
    sanitized = RESERVED_PROJECT_NAME;
  }

  return sanitized;
}
