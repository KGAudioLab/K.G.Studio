/**
 * XMLToolExecutor - Bridge between XML tool invocations and the existing tool system
 * Parses XML blocks from LLM responses and executes corresponding tools
 */

import { extractXMLFromString } from '../../util/xmlUtil';
import { AVAILABLE_TOOLS, type ToolName } from '../tools';
import type { BaseTool, ToolResult } from '../tools/BaseTool';
import { useProjectStore } from '../../stores/projectStore';

/**
 * Main executor class for XML-based tool invocations
 * Integrates with existing tool architecture and streaming types
 */
export class XMLToolExecutor {
  // Private static instance for singleton pattern
  private static _instance: XMLToolExecutor | null = null;

  // Private constructor to prevent direct instantiation
  private constructor() {}

  /**
   * Get the singleton instance of XMLToolExecutor
   */
  public static instance(): XMLToolExecutor {
    if (!XMLToolExecutor._instance) {
      XMLToolExecutor._instance = new XMLToolExecutor();
    }
    return XMLToolExecutor._instance;
  }

  /**
   * Execute all XML tool invocations found in the given input string
   * @param input - String containing XML tool invocations (typically LLM response)
   * @returns Promise resolving to array of tool results in order of appearance
   */
  public async executeXMLTools(input: string): Promise<ToolResult[]> {
    try {
      // Extract all XML blocks from the input
      const xmlBlocks = extractXMLFromString(input);
      
      if (xmlBlocks.length === 0) {
        return [];
      }

      // Process each XML block and collect results
      const results: ToolResult[] = [];

      for (const xmlBlock of xmlBlocks) {
        try {
          const result = await this.executeXMLBlock(xmlBlock);
          results.push(result);
        } catch (error) {
          // Create failed result
          results.push({
            success: false,
            result: `Failed to process XML block: ${error}`
          });
        }
      }

      return results;

    } catch (error) {
      return [{
        success: false,
        result: `Failed to execute XML tools: ${error}`
      }];
    }
  }

  /**
   * Execute a single XML block as a tool invocation
   * @param xmlBlock - XML string representing a tool invocation
   * @returns Promise resolving to tool execution result
   */
  private async executeXMLBlock(xmlBlock: string): Promise<ToolResult> {
    // Parse XML to extract tool information
    const parseResult = this.parseXMLBlock(xmlBlock);
    
    if (!parseResult.success) {
      return {
        success: false,
        result: parseResult.error || 'Failed to parse XML block'
      };
    }

    // Check if tool exists in registry
    if (!(parseResult.toolName in AVAILABLE_TOOLS)) {
      return {
        success: false,
        result: `Unknown tool: ${parseResult.toolName}`
      };
    }

    try {
      // Create tool instance
      const ToolClass = AVAILABLE_TOOLS[parseResult.toolName as ToolName];
      const toolInstance: BaseTool = new ToolClass();

      // Execute the tool
      const toolResult = await toolInstance.execute(parseResult.parameters);
      
      // Sync UI state if the tool execution was successful
      if (toolResult.success) {
        this.syncUIState();
      }
      
      return toolResult;
      
    } catch (error) {
      return {
        success: false,
        result: `Tool execution failed: ${error}`
      };
    }
  }

  /**
   * Parse XML block to extract tool name and parameters
   * @param xmlBlock - XML string to parse
   * @returns Parse result with tool information or error
   */
  private parseXMLBlock(xmlBlock: string): { success: boolean; toolName: string; parameters: Record<string, unknown>; error?: string } {
    try {
      // Special pre-processing for attempt_completion: ensure <comment> is wrapped in CDATA
      const preparedXml = this.preprocessAttemptCompletionXML(xmlBlock);

      // Parse XML using native DOMParser
      const parser = new DOMParser();
      const doc = parser.parseFromString(preparedXml, 'text/xml');

      // Check for parsing errors
      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        return {
          success: false,
          toolName: '',
          parameters: {},
          error: `XML parsing error: ${parserError.textContent}`
        };
      }

      // Get the root element (tool name)
      const rootElement = doc.documentElement;
      const toolName = rootElement.tagName;

      // Parse XML parameters
      const parameters = this.parseXMLParameters(rootElement);

      return {
        success: true,
        toolName,
        parameters
      };

    } catch (error) {
      return {
        success: false,
        toolName: '',
        parameters: {},
        error: `Failed to parse XML: ${error}`
      };
    }
  }

  /**
   * Ensure special tools have CDATA-wrapped content where appropriate.
   * - attempt_completion: wrap <comment> inner text with CDATA (if not already)
   * - think / thinking: wrap root inner text with CDATA (if not already)
   * Decode basic XML entities before wrapping so CDATA contains human-readable text.
   */
  private preprocessAttemptCompletionXML(xml: string): string {
    try {
      const leadingWhitespaceMatch = xml.match(/^\s*/);
      const prefix = leadingWhitespaceMatch ? leadingWhitespaceMatch[0] : '';
      const withoutLeading = xml.slice(prefix.length);
      const rootMatch = withoutLeading.match(/^<([A-Za-z_][\w-]*)\b/);
      const root = rootMatch?.[1] || '';
      if (root !== 'attempt_completion' && root !== 'think' && root !== 'thinking') return xml;

      // Helper to decode entities
      const decodeEntities = (text: string): string =>
        text
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");

      if (root === 'attempt_completion') {
        // Find first <comment>...</comment>
        const commentRegex = /<comment>([\s\S]*?)<\/comment>/i;
        const match = xml.match(commentRegex);
        if (!match) return xml;

        const inner = match[1];
        if (/<!\[CDATA\[/.test(inner)) {
          // Already wrapped
          return xml;
        }

        const decoded = decodeEntities(inner);
        const replacement = `<comment><![CDATA[${decoded}]]></comment>`;
        return xml.replace(commentRegex, replacement);
      }

      // Handle <think>...</think> or <thinking>...</thinking>
      const rootRegex = new RegExp(`<${root}>([\\s\\S]*?)</${root}>`, 'i');
      const rootMatchContent = xml.match(rootRegex);
      if (!rootMatchContent) return xml;
      const innerRoot = rootMatchContent[1];
      if (/<!\[CDATA\[/.test(innerRoot)) {
        return xml; // Already wrapped
      }
      const decodedRoot = decodeEntities(innerRoot);
      const replacementRoot = `<${root}><![CDATA[${decodedRoot}]]></${root}>`;
      return xml.replace(rootRegex, replacementRoot);
    } catch {
      // On any error, return original XML to avoid breaking flow
      return xml;
    }
  }

  /**
   * Parse XML element into tool parameters object
   * Converts XML structure to JavaScript object that matches tool parameter schema
   * @param element - Root XML element containing tool parameters
   * @returns Parameters object for tool execution
   */
  private parseXMLParameters(element: Element): Record<string, unknown> {
    const parameters: Record<string, unknown> = {};

    // Special handling for thinking tool: if no child elements, use text content directly
    if (element.tagName === 'thinking' && element.children.length === 0) {
      const textContent = element.textContent?.trim() || '';
      parameters.content = textContent;
      return parameters;
    }

    // Process all child elements
    for (const child of element.children) {
      const paramName = child.tagName;
      const paramValue = this.parseXMLValue(child);
      
      // Handle arrays (multiple elements with same tag name)
      if (parameters[paramName] !== undefined) {
        // Convert to array if not already
        if (!Array.isArray(parameters[paramName])) {
          parameters[paramName] = [parameters[paramName]];
        }
        (parameters[paramName] as unknown[]).push(paramValue);
      } else {
        parameters[paramName] = paramValue;
      }
    }

    // Apply array wrapper flattening
    return this.flattenArrayWrappers(parameters);
  }

  /**
   * Flatten array wrapper patterns in parsed parameters
   * Converts structures like {notes: {note: [...]}} to {notes: [...]}
   * @param parameters - Parsed parameters object
   * @returns Parameters with flattened array wrappers
   */
  private flattenArrayWrappers(parameters: Record<string, unknown>): Record<string, unknown> {
    const flattened: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(parameters)) {
      if (this.isArrayWrapperCandidate(key, value)) {
        // This is an array wrapper - flatten it
        const wrapperObj = value as Record<string, unknown>;
        const innerKeys = Object.keys(wrapperObj);
        
        if (innerKeys.length === 1) {
          const innerKey = innerKeys[0];
          const innerValue = wrapperObj[innerKey];
          
          // Check if inner key is singular form of outer key
          if (this.isSingularOf(innerKey, key)) {
            // Flatten: {notes: {note: [...]}} → {notes: [...]}
            flattened[key] = innerValue;
            continue;
          }
        }
      }
      
      // No flattening needed, keep as is
      flattened[key] = value;
    }

    return flattened;
  }

  /**
   * Check if a value is a candidate for array wrapper flattening
   * @param key - Parameter key (e.g., "notes")
   * @param value - Parameter value to check
   * @returns True if this looks like an array wrapper pattern
   */
  private isArrayWrapperCandidate(key: string, value: unknown): boolean {
    // Must be an object (not array, not primitive)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }

    const obj = value as Record<string, unknown>;
    const innerKeys = Object.keys(obj);
    
    // Must have exactly one property
    if (innerKeys.length !== 1) {
      return false;
    }

    const innerKey = innerKeys[0];
    const innerValue = obj[innerKey];
    
    // Inner value should be an array or could become an array
    // (single items are often converted to arrays by the parser)
    return this.isSingularOf(innerKey, key) && 
           (Array.isArray(innerValue) || typeof innerValue === 'object');
  }

  /**
   * Check if one word is the singular form of another (simple heuristic)
   * @param singular - Potential singular form (e.g., "note")
   * @param plural - Potential plural form (e.g., "notes")
   * @returns True if singular appears to be singular form of plural
   */
  private isSingularOf(singular: string, plural: string): boolean {
    // Simple heuristics for common English pluralization
    if (plural === singular + 's') return true;           // note → notes
    if (plural === singular + 'es') return true;          // box → boxes  
    if (plural.endsWith('ies') && singular.endsWith('y')) { // entry → entries
      return plural === singular.slice(0, -1) + 'ies';
    }
    
    // Add more rules as needed for your specific use cases
    return false;
  }

  /**
   * Parse a single XML element value, handling different data types and structures
   * @param element - XML element to parse
   * @returns Parsed value (string, number, boolean, object, or array)
   */
  private parseXMLValue(element: Element): unknown {
    // If element has children, parse as object
    if (element.children.length > 0) {
      return this.parseXMLParameters(element);
    }

    // Get text content
    const textContent = element.textContent?.trim() || '';
    
    // Try to parse as number
    if (/^-?\d+(\.\d+)?$/.test(textContent)) {
      return parseFloat(textContent);
    }
    
    // Try to parse as boolean
    if (textContent === 'true') return true;
    if (textContent === 'false') return false;
    
    // Return as string
    return textContent;
  }

  /**
   * Synchronize UI state after successful tool execution
   * Uses the centralized refresh method from the project store
   */
  private syncUIState(): void {
    try {
      // Use the centralized refresh method from the store
      const storeActions = useProjectStore.getState();
      if (storeActions.refreshProjectState) {
        storeActions.refreshProjectState();
      }
      
    } catch (error) {
      console.warn('Failed to sync UI state after XML tool execution:', error);
      // Don't throw - UI sync failure shouldn't break tool execution
    }
  }

}