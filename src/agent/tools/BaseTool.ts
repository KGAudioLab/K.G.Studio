import { KGCommand } from '../../core/commands/KGCommand';
import { KGCore } from '../../core/KGCore';

/**
 * Result of tool execution
 */
export interface ToolResult {
  success: boolean;
  result: string;
}

/**
 * Parameter definition for tool parameters
 */
export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  items?: ToolParameter; // For array types
  properties?: Record<string, ToolParameter>; // For object types
}

/**
 * Tool definition schema
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
}

/**
 * Abstract base class for all agent tools
 * Provides integration with the existing command system and core architecture
 */
export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: Record<string, ToolParameter>;

  /**
   * Execute the tool with given parameters
   * @param params Tool parameters
   * @returns Promise resolving to tool execution result
   */
  abstract execute(params: Record<string, unknown>): Promise<ToolResult>;

  /**
   * Get the tool definition in OpenAI function calling format
   */
  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters
    };
  }

  /**
   * Validate parameters against the tool's parameter schema
   * @param params Parameters to validate
   * @returns True if valid, throws error if invalid
   */
  protected validateParameters(params: Record<string, unknown>): boolean {
    for (const [paramName, paramDef] of Object.entries(this.parameters)) {
      const value = params[paramName];
      
      // Check required parameters
      if (paramDef.required && (value === undefined || value === null)) {
        throw new Error(`Required parameter '${paramName}' is missing`);
      }
      
      // Skip type checking for undefined optional parameters
      if (value === undefined || value === null) {
        continue;
      }
      
      // Type validation
      if (!this.validateParameterType(value, paramDef)) {
        throw new Error(`Parameter '${paramName}' has invalid type. Expected: ${paramDef.type}`);
      }
    }
    
    return true;
  }

  /**
   * Validate a single parameter value against its type definition
   */
  private validateParameterType(value: unknown, paramDef: ToolParameter): boolean {
    switch (paramDef.type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        if (!Array.isArray(value)) return false;
        if (paramDef.items) {
          return value.every(item => this.validateParameterType(item, paramDef.items!));
        }
        return true;
      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return false;
        }
        if (paramDef.properties) {
          const obj = value as Record<string, unknown>;
          for (const [propName, propDef] of Object.entries(paramDef.properties)) {
            if (propDef.required && !(propName in obj)) {
              return false;
            }
            if (propName in obj && !this.validateParameterType(obj[propName], propDef)) {
              return false;
            }
          }
        }
        return true;
      default:
        return false;
    }
  }

  /**
   * Execute a command through the existing command system
   * This provides undo/redo functionality and proper state management
   * @param command Command to execute
   */
  protected async executeCommand(command: KGCommand): Promise<void> {
    const core = KGCore.instance();
    return core.executeCommand(command);
  }

  /**
   * Get the current project from KGCore
   */
  protected getCurrentProject() {
    const core = KGCore.instance();
    return core.getCurrentProject();
  }

  /**
   * Create a successful tool result
   */
  protected createSuccessResult(result: string): ToolResult {
    return {
      success: true,
      result
    };
  }

  /**
   * Create a failed tool result
   */
  protected createErrorResult(result: string): ToolResult {
    return {
      success: false,
      result
    };
  }
}