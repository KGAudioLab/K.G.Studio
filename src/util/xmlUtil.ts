/**
 * XML utility functions for KGSP
 * Contains functions for extracting and processing XML from strings
 */

/**
 * Extract all XML blocks from a given string
 * This function finds complete XML elements (from opening to closing tag) within mixed content,
 * such as LLM responses that contain XML tool invocations alongside natural language text.
 * 
 * @param input - The input string that may contain XML blocks
 * @returns Array of XML strings found in the input, or empty array if none found
 * 
 * @example
 * ```typescript
 * const response = `
 * I'll create a chord for you:
 * <add_notes>
 *   <note>
 *     <pitch>C4</pitch>
 *     <start_beat>0</start_beat>
 *     <length>4</length>
 *   </note>
 * </add_notes>
 * This creates a C major note.
 * `;
 * 
 * const xmlBlocks = extractXMLFromString(response);
 * // Returns: ['<add_notes>\n  <note>\n    <pitch>C4</pitch>\n    <start_beat>0</start_beat>\n    <length>4</length>\n  </note>\n</add_notes>']
 * ```
 */
export function extractXMLFromString(input: string): string[] {
  // Regex pattern to match complete XML blocks:
  // - <([a-zA-Z_][a-zA-Z0-9_-]*) matches opening tag name (capture group 1)
  // - [^>]* matches any attributes in the opening tag
  // - [\s\S]*? matches any content (including newlines) non-greedily
  // - <\/\1> matches the corresponding closing tag using backreference
  const xmlPattern = /<([a-zA-Z_][a-zA-Z0-9_-]*)[^>]*>[\s\S]*?<\/\1>/g;
  
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  
  // Extract all XML blocks
  while ((match = xmlPattern.exec(input)) !== null) {
    const xmlBlock = match[0].trim();
    if (xmlBlock.length > 0) {
      matches.push(xmlBlock);
    }
  }
  
  return matches;
}