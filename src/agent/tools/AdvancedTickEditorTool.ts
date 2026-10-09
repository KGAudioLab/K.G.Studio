import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import { requireTick } from './advancedToolUtils';
import { TICKS_PER_QUARTER } from '../../core/timing';

/** Adapt only the public timing contract; legacy commands retain targeting and undo semantics. */
export class AdvancedTickEditorTool extends BaseTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, ToolParameter>;

  constructor(private readonly legacy: BaseTool) {
    super();
    this.name = legacy.name;
    this.parameters = this.convertSchema(legacy.parameters);
    this.description = `Advanced ${this.name}: all positions and durations are integer ticks (960 per quarter note). ${
      legacy.description.replace(/quarter-note units/g, 'ticks').replace(/absolute start-beat range/g, 'absolute start-tick range').replace(/absolute beat range/g, 'absolute tick range').replace(/start beat/g, 'start tick').replace(/absolute beat positions/g, 'absolute tick positions').replace(/\(1 = one quarter note\)/g, '(960 = one quarter note)')
    }${this.name === 'write_bpm' || this.name === 'write_key_signature' ? ' Explicit changes retain bar alignment.' : ''}${this.name === 'write_key_signature' ? ' Key inputs use canonical names such as C major or A minor.' : ''}`;
  }

  override isReadOnlyTool(): boolean { return this.legacy.isReadOnlyTool(); }
  override isAvailableInRegularMode(): boolean { return this.legacy.isAvailableInRegularMode(); }
  override isAvailableInAdvancedMode(): boolean { return this.legacy.isAvailableInAdvancedMode(); }
  override isAvailableInEfficientMode(): boolean { return this.legacy.isAvailableInEfficientMode(); }

  private convertSchema(schema: Record<string, ToolParameter>): Record<string, ToolParameter> {
    return Object.fromEntries(Object.entries(schema).map(([key, value]) => {
      const targetKey = key === 'beat' ? 'start' : key;
      const converted = { ...value };
      if (['start', 'end', 'length', 'beat'].includes(key)) {
        converted.description = key === 'length'
          ? 'Positive integer duration in ticks (960 ticks per quarter note).'
          : `Absolute ${targetKey} in nonnegative integer ticks (960 per quarter note). ${value.required ? '' : 'Omitted, null, or empty specifies the global/default value.'}`;
        if (key === 'end') {
          converted.description += this.name === 'remove_notes'
            ? ' Exclusive end; must be greater than start. Only notes starting in the range are removed.'
            : ' Exclusive when start < end. When start equals end, remove only regions starting at that tick.';
        }
      } else {
        converted.description = value.description.replace(/quarter-note units/g, 'ticks').replace(/"beat"/g, '"start"').replace(/beat-less/g, 'start-less').replace(/beat-based/g, 'tick-based');
      }
      if (value.properties) converted.properties = this.convertSchema(value.properties);
      if (value.items) converted.items = this.convertSchema({ item: value.items }).item;
      return [targetKey, converted];
    }));
  }

  private toLegacy(args: Record<string, unknown>, schema = this.legacy.parameters): Record<string, unknown> {
    const converted: Record<string, unknown> = { ...args };
    for (const [key, parameter] of Object.entries(schema)) {
      const advancedKey = key === 'beat' ? 'start' : key;
      const value = args[advancedKey];
      if (key === 'beat' && Object.prototype.hasOwnProperty.call(args, 'beat')) {
        throw new Error('Advanced tools use start in ticks, not beat.');
      }
      if (value === undefined) continue;
      if (['start', 'end', 'length', 'beat'].includes(key)) {
        converted[key] = key === 'beat' && !parameter.required && (value === null || value === '')
          ? value : requireTick(value, advancedKey, key === 'length') / TICKS_PER_QUARTER;
        if (key !== advancedKey) delete converted[advancedKey];
      } else if (parameter.type === 'array' && Array.isArray(value) && parameter.items?.properties) {
        converted[key] = value.map(item => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${key} entries must be objects.`);
          return this.toLegacy(item as Record<string, unknown>, parameter.items!.properties!);
        });
      }
    }
    return converted;
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try { return await this.legacy.execute(this.toLegacy(params)); }
    catch (error) { return this.createErrorResult(`Invalid advanced ${this.name} arguments: ${error}`); }
  }

  override buildConfirmationContent(args: Record<string, unknown> | null): string | undefined {
    try { return args ? this.legacy.buildConfirmationContent(this.toLegacy(args)) : undefined; }
    catch { return undefined; }
  }
  override buildToolResultDisplayContent(args: Record<string, unknown> | null, result: ToolResult): string | undefined {
    try { return this.legacy.buildToolResultDisplayContent(args ? this.toLegacy(args) : null, result); }
    catch { return undefined; }
  }
  override buildToolHistoryContent(args: Record<string, unknown> | null, result: ToolResult): string | undefined {
    try { return this.legacy.buildToolHistoryContent(args ? this.toLegacy(args) : null, result); }
    catch { return undefined; }
  }
}
