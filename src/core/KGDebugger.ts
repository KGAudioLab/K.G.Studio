/**
 * KGDebugger - Global debugging utility for KGSP
 * Provides console access to internal methods for testing and debugging
 */

import { KGCore } from './KGCore';
import { KGMidiRegion } from './region/KGMidiRegion';
import { convertRegionToABCNotation } from '../util/abcNotationUtil';
import { extractXMLFromString } from '../util/xmlUtil';
import { XMLToolExecutor } from '../agent/core/XMLToolExecutor';
import { AgentCore } from '../agent/core/AgentCore';
import { AttemptCompletionTool } from '../agent/tools/AttemptCompletionTool';
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
      'testXMLToolExecution(input)',
      'testAttemptCompletion(comment)'
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
   * Test the complete XML tool execution pipeline
   * @param input - String containing XML tool invocations to execute
   */
  public async testXMLToolExecution(input: string): Promise<void> {
    console.log('------------ ASSISTANT ------------');
    console.log(input);
    console.log('-----------------------------------');
    
    try {
      // Extract XML blocks first to get tool names (same logic as ChatBox)
      const xmlBlocks = extractXMLFromString(input);
      
      if (xmlBlocks.length === 0) {
        console.log('------------ USER ------------');
        console.log('No XML tool invocations found in the input string.');
        console.log('------------------------------');
        return;
      }

      const executor = XMLToolExecutor.instance();
      let accumulatedResults = '';

      // Execute tools sequentially and format like ChatBox
      for (let i = 0; i < xmlBlocks.length; i++) {
        // Determine tool name from XML block (same as ChatBox lines 148-149)
        const toolNameMatch = xmlBlocks[i].match(/<([a-zA-Z_][a-zA-Z0-9_-]*)/);
        const toolName = toolNameMatch ? toolNameMatch[1] : 'unknown_tool';

        try {
          // Execute single XML block
          const results = await executor.executeXMLTools(xmlBlocks[i]);
          const result = results[0]; // Single block should give single result
          
          if (result) {
            // Format exactly like ChatBox lines 161-162
            const formattedResult = `tool: ${toolName}\nsuccess: ${result.success}\nresult:\n${result.result}\n------------\n`;
            accumulatedResults += formattedResult;
          }
        } catch (error) {
          // Handle individual tool error (same format)
          const formattedResult = `tool: ${toolName}\nsuccess: false\nresult:\nTool execution failed: ${error}\n------------\n`;
          accumulatedResults += formattedResult;
        }
      }

      // Log accumulated results as USER (what gets sent back to LLM)
      console.log('------------ USER ------------');
      console.log(accumulatedResults);
      console.log('------------------------------');
      
      // Copy results to clipboard if possible
      if (navigator.clipboard) {
        navigator.clipboard.writeText(accumulatedResults).then(() => {
          console.log("Tool execution results copied to clipboard!");
        }).catch(() => {
          console.log("Could not copy to clipboard (requires HTTPS)");
        });
      }
      
    } catch (error) {
      console.log('------------ USER ------------');
      console.log(`Error testing XML tool execution: ${error}`);
      console.log('------------------------------');
    }
  }

  /**
   * Test the AttemptCompletionTool with agent state integration
   * @param comment - Completion comment to test with
   */
  public async testAttemptCompletion(comment: string): Promise<void> {
    console.log("🎯 Testing AttemptCompletionTool...");
    console.log(`📝 Comment: "${comment}"`);
    
    try {
      // Get current agent state before test
      const agentCore = AgentCore.instance();
      const agentState = agentCore.getAgentState();
      const initialTaskState = agentState.getIsWorkingOnTask();
      
      console.log(`📊 Initial agent state:`);
      console.log(`  • isWorkingOnTask: ${initialTaskState}`);
      
      // Set to working state to test the completion properly
      if (!initialTaskState) {
        console.log("🔄 Setting isWorkingOnTask to true for testing...");
        agentState.setIsWorkingOnTask(true);
      }
      
      // Create and execute the tool
      const completionTool = new AttemptCompletionTool();
      const result = await completionTool.execute({ comment });
      
      console.log(`✅ Tool execution result:`);
      console.log(`  • Success: ${result.success}`);
      console.log(`  • Result: ${result.result}`);
      
      // Check final agent state
      const finalTaskState = agentState.getIsWorkingOnTask();
      console.log(`📊 Final agent state:`);
      console.log(`  • isWorkingOnTask: ${finalTaskState}`);
      
      // Verify state change
      if (result.success && finalTaskState === false) {
        console.log("🎉 Success! Agent state correctly updated to not working on task.");
      } else if (!result.success) {
        console.log("⚠️ Tool execution failed - state may not have changed.");
      } else {
        console.log("⚠️ Warning: State did not change as expected.");
      }
      
      // Copy result to clipboard if possible
      if (navigator.clipboard) {
        const clipboardContent = JSON.stringify(result, null, 2);
        navigator.clipboard.writeText(clipboardContent).then(() => {
          console.log("📋 Test results copied to clipboard!");
        }).catch(() => {
          console.log("📋 Could not copy to clipboard (requires HTTPS)");
        });
      }
      
    } catch (error) {
      console.error("❌ Error testing AttemptCompletionTool:", error);
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
    console.log("  testXMLToolExecution(input) - Test complete XML tool execution pipeline");
    console.log("  testAttemptCompletion(comment) - Test AttemptCompletionTool with agent state");
    console.log("  help() - Show this help");
    console.log("");
    console.log("💡 Usage tips:");
    console.log("  - Select regions in the DAW first, then run debug methods");
    console.log("  - Results are logged to console and copied to clipboard when possible");
    console.log("  - Use browser developer tools for best experience");
    console.log("  - For XML testing, try: testExtractXMLFromString('I will <add_notes><note>...</note></add_notes> create notes');");
    console.log("  - For full tool execution, try: await testXMLToolExecution('Create notes: <add_notes><note><pitch>C4</pitch><start_beat>0</start_beat><length>1</length></note></add_notes>');");
    console.log("  - For completion testing, try: await testAttemptCompletion('Successfully created a C major chord');");
  }
}