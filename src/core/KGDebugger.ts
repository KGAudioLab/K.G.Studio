/**
 * KGDebugger - Global debugging utility for KGSP
 * Provides console access to internal methods for testing and debugging
 */

import { KGCore } from './KGCore';
import { KGMidiRegion } from './region/KGMidiRegion';
import { convertRegionToABCNotation } from '../util/abcNotationUtil';
import { extractXMLFromString } from '../util/xmlUtil';
import { AgentCore } from '../agent/core/AgentCore';
import { AVAILABLE_TOOLS } from '../agent/tools';
import type { TimeSignature } from '../types/projectTypes';
import { useProjectStore } from '../stores/projectStore';

/**
 * Global debugger singleton for console-based testing
 */
export class KGDebugger {
  // Private static instance for singleton pattern
  private static _instance: KGDebugger | null = null;

  // Private constructor to prevent direct instantiation
  private constructor() {
    console.log("🔧 KGDebugger initialized - Available methods:", [
      'convertSelectedRegionToABCNotation(startFromBeat?)',
      'testQuantizeDuration(durationBeats, timeSignature?)',
      'debugSelectedItems()',
      'createTestRegion()',
      'testExtractXMLFromString(input)',
      'testToolCall(jsonInput)',
      'inputChatBox(content, interval?)'
    ]);
  }

  /**
   * Get the singleton instance of KGDebugger
   */
  public static instance(): KGDebugger {
    if (!KGDebugger._instance) {
      KGDebugger._instance = new KGDebugger();
    }
    return KGDebugger._instance;
  }

  /**
   * Convert the currently selected region to ABC notation
   * @param startFromBeat - Optional absolute beat position to start from (defaults to region start)
   */
  public convertSelectedRegionToABCNotation(startFromBeat?: number): void {
    const core = KGCore.instance();
    const selectedItems = core.getSelectedItems();

    let midiRegion: KGMidiRegion | null = null;

    // First try to find MIDI region in selected items
    if (selectedItems && selectedItems.length > 0) {
      console.log(`📝 Converting selected region to ABC notation...`);
      console.log(`📊 Selected items count: ${selectedItems.length}`);

      midiRegion = selectedItems.find(item => 
        item.getCurrentType() === 'KGMidiRegion'
      ) as KGMidiRegion;
    }

    // If no MIDI region selected, try to use active region from piano roll
    if (!midiRegion) {
      console.log("📝 No MIDI region selected, checking for active region...");
      
      const storeState = useProjectStore.getState();
      const activeRegionId = storeState.activeRegionId;
      const tracks = storeState.tracks;

      if (activeRegionId) {
        // Find the active region in tracks
        for (const track of tracks) {
          const regions = track.getRegions();
          const region = regions.find(r => r.getId() === activeRegionId);
          
          if (region && region instanceof KGMidiRegion) {
            midiRegion = region;
            console.log(`✅ Found active region: "${region.getName()}"`);
            break;
          }
        }
      }
    }

    if (!midiRegion) {
      console.error("❌ No MIDI region found.");
      console.log("💡 Try one of these:");
      console.log("  • Select a region in the track grid");
      console.log("  • Open a region in the piano roll editor");
      return;
    }

    // Use provided startFromBeat or default to region start
    const effectiveStartBeat = startFromBeat ?? midiRegion.getStartFromBeat();
    
    console.log(`🎵 Converting region: "${midiRegion.getName()}"`);
    console.log(`📍 Region starts at beat: ${midiRegion.getStartFromBeat()}`);
    console.log(`📍 Conversion starts at beat: ${effectiveStartBeat}`);
    console.log(`🎼 Notes in region: ${midiRegion.getNotes().length}`);

    try {
      const abcNotation = convertRegionToABCNotation(midiRegion, effectiveStartBeat);
      
      console.log("✅ ABC Notation conversion successful!");
      console.log("📄 Result:");
      console.log("─".repeat(50));
      console.log(abcNotation);
      console.log("─".repeat(50));
      
      // Also copy to clipboard if possible
      if (navigator.clipboard) {
        navigator.clipboard.writeText(abcNotation).then(() => {
          console.log("📋 ABC notation copied to clipboard!");
        }).catch(() => {
          console.log("📋 Could not copy to clipboard (requires HTTPS)");
        });
      }
      
    } catch (error) {
      console.error("❌ Error converting to ABC notation:", error);
    }
  }

  /**
   * Test the quantization duration method with a specific duration
   * @param durationBeats - Duration in beats to test
   * @param timeSignature - Optional time signature (defaults to project time signature)
   */
  public testQuantizeDuration(durationBeats: number, timeSignature?: TimeSignature): void {
    const core = KGCore.instance();
    const project = core.getCurrentProject();
    const effectiveTimeSignature = timeSignature ?? project.getTimeSignature();
    
    console.log(`🧮 Testing quantization for ${durationBeats} beats...`);
    console.log(`⏱️ Time signature: ${effectiveTimeSignature.numerator}/${effectiveTimeSignature.denominator}`);
    
    // Import quantization testing (we'll need to expose some internal methods)
    // For now, let's create a simple test
    const ticksPerBeat = 480 * (4 / effectiveTimeSignature.denominator);
    const durationTicks = Math.round(durationBeats * ticksPerBeat);
    
    console.log(`🎵 Input: ${durationBeats} beats = ${durationTicks} ticks`);
    
    // Test different quantization values manually for demonstration
    const testValues = [
      { name: '1/1', ticks: 1920 },
      { name: '1/2', ticks: 960 },
      { name: '1/3', ticks: 640 },
      { name: '1/4', ticks: 480 },
      { name: '1/6', ticks: 320 },
      { name: '1/8', ticks: 240 },
      { name: '1/12', ticks: 160 },
      { name: '1/16', ticks: 120 }
    ];
    
    console.log("📊 Quantization analysis:");
    let bestMatch = { name: '1/4', error: Infinity, ticks: 480 };
    
    testValues.forEach(val => {
      const remainder = durationTicks % val.ticks;
      const error = Math.min(remainder, val.ticks - remainder);
      const errorPercent = ((error / val.ticks) * 100).toFixed(1);
      
      if (error < bestMatch.error) {
        bestMatch = { name: val.name, error, ticks: val.ticks };
      }
      
      console.log(`  ${val.name}: ${error} ticks error (${errorPercent}%)`);
    });
    
    const quantizedTicks = Math.round(durationTicks / bestMatch.ticks) * bestMatch.ticks;
    const quantizedBeats = quantizedTicks / ticksPerBeat;
    
    console.log(`✅ Best match: ${bestMatch.name} grid`);
    console.log(`🎯 Quantized: ${quantizedBeats} beats = ${quantizedTicks} ticks`);
    console.log(`📏 Difference: ${Math.abs(durationBeats - quantizedBeats).toFixed(4)} beats`);
  }

  /**
   * Debug currently selected items
   */
  public debugSelectedItems(): void {
    const core = KGCore.instance();
    const selectedItems = core.getSelectedItems();
    
    console.log(`🔍 Currently selected items: ${selectedItems.length}`);
    
    if (selectedItems.length === 0) {
      console.log("📝 No items selected. Try selecting regions or notes first.");
      return;
    }
    
    selectedItems.forEach((item, index) => {
      const type = item.getCurrentType();
      const id = item.getId();
      
      console.log(`  ${index + 1}. ${type} (ID: ${id})`);
      
      if (type === 'KGMidiRegion') {
        const region = item as KGMidiRegion;
        console.log(`     📍 Position: ${region.getStartFromBeat()} beats`);
        console.log(`     📏 Length: ${region.getLength()} beats`);
        console.log(`     🎵 Notes: ${region.getNotes().length}`);
        console.log(`     📛 Name: "${region.getName()}"`);
      }
    });
  }

  /**
   * Create a test region with sample notes for testing (future implementation)
   */
  public createTestRegion(): void {
    console.log("🚧 createTestRegion() - Not implemented yet");
    console.log("💡 This method would create a region with sample notes for testing");
    console.log("💡 For now, please create regions manually in the DAW interface");
  }

  /**
   * Test the extractXMLFromString utility function with a given input
   * @param input - String that may contain XML blocks to extract
   */
  public testExtractXMLFromString(input: string): void {
    console.log("🔍 Testing extractXMLFromString utility...");
    console.log("📝 Input string:");
    console.log("─".repeat(50));
    console.log(input);
    console.log("─".repeat(50));
    
    try {
      const xmlBlocks = extractXMLFromString(input);
      
      console.log(`✅ Extraction successful! Found ${xmlBlocks.length} XML block(s):`);
      
      if (xmlBlocks.length === 0) {
        console.log("📭 No XML blocks found in the input string.");
        console.log("💡 Try input with XML tags like: <add_notes>...</add_notes>");
      } else {
        xmlBlocks.forEach((block, index) => {
          console.log("\n📄 XML Block " + (index + 1) + ":");
          console.log("─".repeat(30));
          console.log(block);
          console.log("─".repeat(30));
        });
        
        // Copy all blocks to clipboard if possible
        if (navigator.clipboard && xmlBlocks.length > 0) {
          const allBlocks = xmlBlocks.join('\n\n');
          navigator.clipboard.writeText(allBlocks).then(() => {
            console.log("📋 XML blocks copied to clipboard!");
          }).catch(() => {
            console.log("📋 Could not copy to clipboard (requires HTTPS)");
          });
        }
      }
      
    } catch (error) {
      console.error("❌ Error extracting XML:", error);
    }
  }

  /**
   * Test native tool calling by executing tool calls from a JSON string.
   * Accepts a single tool call object or an array of tool call objects.
   *
   * Usage examples in browser console:
   *
   *   // Single tool call:
   *   await KGStudio.KGDebugger.testToolCall('{"name":"read_music","arguments":{"start_beat":0,"length":8}}')
   *
   *   // Multiple tool calls:
   *   await KGStudio.KGDebugger.testToolCall('[{"name":"remove_notes","arguments":{"start_beat":0,"end_beat":4}},{"name":"add_notes","arguments":{"notes":[{"pitch":"C4","start_beat":0,"length":1}]}}]')
   *
   *   // Can also pass a JS object directly (no need to stringify):
   *   await KGStudio.KGDebugger.testToolCall({name:"read_music",arguments:{start_beat:0}})
   *
   * @param input - JSON string, object, or array of tool call(s).
   *   Each tool call should have: { name: string, arguments: object }
   */
  public async testToolCall(input: string | Record<string, unknown> | Record<string, unknown>[]): Promise<void> {
    try {
      // Parse input
      let calls: Array<{ name: string; arguments: Record<string, unknown> }>;

      if (typeof input === 'string') {
        const parsed = JSON.parse(input);
        calls = Array.isArray(parsed) ? parsed : [parsed];
      } else if (Array.isArray(input)) {
        calls = input as Array<{ name: string; arguments: Record<string, unknown> }>;
      } else {
        calls = [input as { name: string; arguments: Record<string, unknown> }];
      }

      console.log(`🔧 Executing ${calls.length} tool call(s)...\n`);

      for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        const toolName = call.name;
        const toolArgs = call.arguments ?? {};

        console.log(`── Tool call ${i + 1}/${calls.length}: ${toolName}`);
        console.log(`   Arguments: ${JSON.stringify(toolArgs, null, 2)}`);

        const ToolClass = AVAILABLE_TOOLS[toolName as keyof typeof AVAILABLE_TOOLS];
        if (!ToolClass) {
          console.error(`   ❌ Unknown tool: "${toolName}". Available tools: ${Object.keys(AVAILABLE_TOOLS).join(', ')}`);
          continue;
        }

        const toolInstance = new ToolClass();
        const result = await toolInstance.execute(toolArgs);

        // Sync UI state on success
        if (result.success) {
          useProjectStore.getState().refreshProjectState();
        }

        const icon = result.success ? '✅' : '❌';
        console.log(`   ${icon} Success: ${result.success}`);
        console.log(`   Result: ${result.result}\n`);
      }

      console.log('🔧 Tool execution complete.');

    } catch (error) {
      console.error('❌ Error in testToolCall:', error);
      console.log('💡 Expected format: {"name":"tool_name","arguments":{...}}');
      console.log('   Or an array: [{"name":"tool1","arguments":{...}}, ...]');
    }
  }

  /**
   * Show help information
   */
  public help(): void {
    console.log("🔧 KGDebugger Help");
    console.log("Available methods:");
    console.log("  convertSelectedRegionToABCNotation(startFromBeat?) - Convert selected region to ABC");
    console.log("  testQuantizeDuration(beats, timeSignature?) - Test quantization logic");
    console.log("  debugSelectedItems() - Show info about selected items");
    console.log("  createTestRegion() - Create test region (not implemented)");
    console.log("  testExtractXMLFromString(input) - Test XML extraction from string");
    console.log("  testToolCall(input) - Execute tool call(s) from JSON and show results");
    console.log("  inputChatBox(content, interval?) - Type into ChatBox textarea and submit with Enter");
    console.log("  help() - Show this help");
    console.log("");
    console.log("💡 Usage tips:");
    console.log("  - Select regions in the DAW first, then run debug methods");
    console.log("  - Results are logged to console and copied to clipboard when possible");
    console.log("  - Use browser developer tools for best experience");
    console.log("");
    console.log("💡 testToolCall examples:");
    console.log('  await KGStudio.KGDebugger.testToolCall(\'{"name":"read_music","arguments":{"start_beat":0,"length":8}}\')');
    console.log('  await KGStudio.KGDebugger.testToolCall({name:"add_notes",arguments:{notes:[{pitch:"C4",start_beat:0,length:1}]}})');
    console.log('  await KGStudio.KGDebugger.testToolCall([{name:"remove_notes",arguments:{start_beat:0,end_beat:4}},{name:"read_music",arguments:{}}])');
  }

  /**
   * Type content into ChatBox textarea character-by-character and submit with Enter.
   * Honors auto-resize (by dispatching 'input' events) and ChatBox's Enter-to-send behavior.
   * @param content - The text to type into the chat input
   * @param interval - Delay in ms between characters (default 30ms)
   */
  public async inputChatBox(content: string, interval: number = 30): Promise<void> {
    try {
      const textarea = document.querySelector('textarea.chatbox-input') as HTMLTextAreaElement | null;
      if (!textarea) {
        console.error('❌ ChatBox textarea not found. Ensure ChatBox is mounted and visible.');
        return;
      }

      // Focus to trigger ChatBox focus handlers and ensure caret/attribute setup
      textarea.focus();

      // Use native value setter to keep React's value tracker in sync
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      const setValue = (val: string) => {
        if (valueSetter) {
          valueSetter.call(textarea, val);
        } else {
          textarea.value = val;
        }
      };

      // Helper to dispatch an InputEvent so React's onChange fires
      const dispatchInput = (data?: string) => {
        const ev = typeof InputEvent !== 'undefined'
          ? new InputEvent('input', { bubbles: true, data, inputType: 'insertText' })
          : new Event('input', { bubbles: true });
        textarea.dispatchEvent(ev);
      };

      // Start from empty content to simulate a fresh user input
      setValue('');
      dispatchInput('');

      // Helper: sleep
      const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

      let typed = '';
      for (let i = 0; i < content.length; i++) {
        typed += content[i];

        // Update the controlled textarea and dispatch input so React onChange fires
        setValue(typed);
        dispatchInput(content[i]);

        // Place caret at end for realism
        try {
          textarea.selectionStart = textarea.selectionEnd = typed.length;
        } catch {
          // noop
        }

        if (interval > 0) {
          await sleep(interval);
        }
      }

      // Give React a brief moment to commit the last setState and run auto-resize effect
      await sleep(Math.max(30, interval));

      // Simulate pressing Enter to submit (ChatBox listens on keydown)
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      } as KeyboardEventInit & { keyCode: number; which: number });
      textarea.dispatchEvent(enterEvent);

      // Optional: follow-up keyup to mirror real typing (some UIs inspect it)
      const keyupEvent = new KeyboardEvent('keyup', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
      } as KeyboardEventInit & { keyCode: number; which: number });
      textarea.dispatchEvent(keyupEvent);
    } catch (error) {
      console.error('❌ Error in inputChatBox:', error);
    }
  }
}