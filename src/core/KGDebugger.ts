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
      'inputChatBox(content, interval?)',
      'inputKGOneCaption(content, interval?)',
      'inputKGOneLyrics(content, interval?)',
      'opfs(command)',
      'startShell()',
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
   *   await KGStudio.KGDebugger.testToolCall('{"name":"read_music","arguments":{"start":0,"length":8}}')
   *
   *   // Multiple tool calls:
   *   await KGStudio.KGDebugger.testToolCall('[{"name":"remove_notes","arguments":{"start":0,"end_beat":4}},{"name":"add_notes","arguments":{"notes":[{"pitch":"C4","start":0,"length":1}]}}]')
   *
   *   // Can also pass a JS object directly (no need to stringify):
   *   await KGStudio.KGDebugger.testToolCall({name:"read_music",arguments:{start:0}})
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
    console.log("  inputKGOneCaption(content, interval?) - Type into KGOne Caption textarea (Full Song tab)");
    console.log("  inputKGOneLyrics(content, interval?) - Type into KGOne Lyrics textarea (Full Song tab)");
    console.log("  opfs(command) - OPFS file browser (pwd, ls, cd, cat, dl, rm)");
    console.log("  startShell() - Start interactive OPFS shell (prompt-based loop)");
    console.log("  help() - Show this help");
    console.log("");
    console.log("💡 Usage tips:");
    console.log("  - Select regions in the DAW first, then run debug methods");
    console.log("  - Results are logged to console and copied to clipboard when possible");
    console.log("  - Use browser developer tools for best experience");
    console.log("");
    console.log("💡 testToolCall examples:");
    console.log('  await KGStudio.KGDebugger.testToolCall(\'{"name":"read_music","arguments":{"start":0,"length":8}}\')');
    console.log('  await KGStudio.KGDebugger.testToolCall({name:"add_notes",arguments:{notes:[{pitch:"C4",start:0,length:1}]}})');
    console.log('  await KGStudio.KGDebugger.testToolCall([{name:"remove_notes",arguments:{start:0,end_beat:4}},{name:"read_music",arguments:{}}])');
    console.log("");
    console.log("💡 KGOne input examples:");
    console.log('  await KGStudio.KGDebugger.inputKGOneCaption("Genre: Eurodance, 90s dance-pop, upbeat electronic...", 30)');
    console.log('  await KGStudio.KGDebugger.inputKGOneLyrics("[Verse 1]\\nYour lyrics here...\\n\\n[Chorus]\\n...", 30)');
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

  /**
   * Type content into K.G.One Caption textarea character-by-character.
   * Honors auto-resize (by dispatching 'input' events).
   * Note: Unlike ChatBox, this does NOT auto-submit (no Enter key dispatch).
   * @param content - The text to type into the caption input
   * @param interval - Delay in ms between characters (default 30ms)
   */
  public async inputKGOneCaption(content: string, interval: number = 30): Promise<void> {
    try {
      const label = Array.from(document.querySelectorAll('label.kgone-label')).find(
        el => el.textContent?.trim() === 'Caption'
      );
      if (!label) {
        console.error('❌ Caption label not found. Ensure KGOne panel is visible with Full Song tab selected.');
        return;
      }

      const textarea = label.nextElementSibling as HTMLTextAreaElement | null;
      if (!textarea || textarea.tagName !== 'TEXTAREA') {
        console.error('❌ Caption textarea not found after the label.');
        return;
      }

      textarea.focus();

      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      const setValue = (val: string) => {
        if (valueSetter) {
          valueSetter.call(textarea, val);
        } else {
          textarea.value = val;
        }
      };

      const dispatchInput = (data?: string) => {
        const ev = typeof InputEvent !== 'undefined'
          ? new InputEvent('input', { bubbles: true, data, inputType: 'insertText' })
          : new Event('input', { bubbles: true });
        textarea.dispatchEvent(ev);
      };

      setValue('');
      dispatchInput('');

      const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

      let typed = '';
      for (let i = 0; i < content.length; i++) {
        typed += content[i];
        setValue(typed);
        dispatchInput(content[i]);

        try {
          textarea.selectionStart = textarea.selectionEnd = typed.length;
        } catch {
        }

        textarea.scrollTop = textarea.scrollHeight;

        if (interval > 0) {
          await sleep(interval);
        }
      }

      await sleep(Math.max(30, interval));
    } catch (error) {
      console.error('❌ Error in inputKGOneCaption:', error);
    }
  }

  /**
   * Type content into K.G.One Lyrics textarea character-by-character.
   * Honors auto-resize (by dispatching 'input' events).
   * Note: Unlike ChatBox, this does NOT auto-submit (no Enter key dispatch).
   * @param content - The text to type into the lyrics input
   * @param interval - Delay in ms between characters (default 30ms)
   */
  public async inputKGOneLyrics(content: string, interval: number = 30): Promise<void> {
    try {
      const label = Array.from(document.querySelectorAll('label.kgone-label')).find(
        el => el.textContent?.trim() === 'Lyrics'
      );
      if (!label) {
        console.error('❌ Lyrics label not found. Ensure KGOne panel is visible with Full Song tab selected.');
        return;
      }

      const textarea = label.nextElementSibling as HTMLTextAreaElement | null;
      if (!textarea || textarea.tagName !== 'TEXTAREA') {
        console.error('❌ Lyrics textarea not found after the label.');
        return;
      }

      textarea.focus();

      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      const setValue = (val: string) => {
        if (valueSetter) {
          valueSetter.call(textarea, val);
        } else {
          textarea.value = val;
        }
      };

      const dispatchInput = (data?: string) => {
        const ev = typeof InputEvent !== 'undefined'
          ? new InputEvent('input', { bubbles: true, data, inputType: 'insertText' })
          : new Event('input', { bubbles: true });
        textarea.dispatchEvent(ev);
      };

      setValue('');
      dispatchInput('');

      const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

      let typed = '';
      for (let i = 0; i < content.length; i++) {
        typed += content[i];
        setValue(typed);
        dispatchInput(content[i]);

        try {
          textarea.selectionStart = textarea.selectionEnd = typed.length;
        } catch {
        }

        textarea.scrollTop = textarea.scrollHeight;

        if (interval > 0) {
          await sleep(interval);
        }
      }

      await sleep(Math.max(30, interval));
    } catch (error) {
      console.error('❌ Error in inputKGOneLyrics:', error);
    }
  }

  /**
   * Start an interactive OPFS shell using browser prompt() dialogs.
   * Each prompt shows the current working directory. Type commands and click OK.
   * Click Cancel or type 'exit'/'quit' to end the session.
   */
  public async startShell(): Promise<void> {
    console.log('📟 OPFS Interactive Shell');
    console.log('   Commands: pwd, ls, cd <path>, cat <file>, dl <file>, rm <name>');
    console.log('   Type "exit" or click Cancel to quit.\n');

    let lastOutput = '';

    while (true) {
      const cwd = '/' + this.opfsCwd.join('/');
      const promptText = lastOutput
        ? `${lastOutput}\n\nopfs:${cwd}$ `
        : `opfs:${cwd}$ `;
      const input = prompt(promptText);

      if (input === null) break;

      const trimmed = input.trim();
      if (trimmed === '') continue;
      if (trimmed === 'exit' || trimmed === 'quit') break;

      // Capture console output during command execution
      const captured: string[] = [];
      const origLog = console.log;
      const origError = console.error;
      console.log = (...args: unknown[]) => {
        origLog(...args);
        captured.push(args.map(String).join(' '));
      };
      console.error = (...args: unknown[]) => {
        origError(...args);
        captured.push(args.map(String).join(' '));
      };

      try {
        await this.opfs(trimmed);
      } finally {
        console.log = origLog;
        console.error = origError;
      }

      lastOutput = captured.join('\n');
    }

    console.log('📟 Shell exited.');
  }

  // --- OPFS Shell ---

  /** Current working directory path segments (relative to OPFS root) */
  private opfsCwd: string[] = [];

  /**
   * Simplified bash-like shell for browsing the OPFS filesystem.
   *
   * Supported commands:
   *   pwd              — print current directory
   *   ls               — list files/folders (like ls -lla)
   *   cd <path>        — change directory (supports .., /, relative, and quoted paths)
   *   cat <file>       — print file contents
   *   dl <file>        — download a file to your local machine
   *   rm <name>        — remove a file or directory (recursive)
   *
   * Usage in console:
   *   await KGDebugger.opfs('pwd')
   *   await KGDebugger.opfs('ls')
   *   await KGDebugger.opfs('cd projects')
   *   await KGDebugger.opfs('cat project.json')
   */
  public async opfs(command: string): Promise<void> {
    const parts = command.trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
    const cmd = parts[0];
    // Strip surrounding quotes from arguments
    const arg = parts.slice(1).map(p => p.replace(/^["']|["']$/g, '')).join(' ');

    try {
      switch (cmd) {
        case 'pwd':
          console.log('/' + this.opfsCwd.join('/'));
          break;

        case 'ls':
          await this.opfsLs();
          break;

        case 'cd':
          await this.opfsCd(arg);
          break;

        case 'cat':
          await this.opfsCat(arg);
          break;

        case 'dl':
          await this.opfsDl(arg);
          break;

        case 'rm':
          await this.opfsRm(arg);
          break;

        default:
          console.log(`opfs: command not found: ${cmd}`);
          console.log('Available commands: pwd, ls, cd <path>, cat <file>, dl <file>, rm <name>');
      }
    } catch (error) {
      console.error(`opfs: ${error}`);
    }
  }

  private async opfsResolveCwd(): Promise<FileSystemDirectoryHandle> {
    let dir = await navigator.storage.getDirectory();
    for (const segment of this.opfsCwd) {
      dir = await dir.getDirectoryHandle(segment);
    }
    return dir;
  }

  private async opfsLs(): Promise<void> {
    const dir = await this.opfsResolveCwd();
    const entries: Array<{ kind: string; name: string; size: number; modified: string }> = [];

    for await (const entry of dir.values()) {
      if (entry.kind === 'file') {
        const fileHandle = entry as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        entries.push({
          kind: 'file',
          name: entry.name,
          size: file.size,
          modified: new Date(file.lastModified).toISOString().replace('T', ' ').slice(0, 19),
        });
      } else {
        entries.push({
          kind: 'dir',
          name: entry.name + '/',
          size: 0,
          modified: '-',
        });
      }
    }

    // Sort: directories first, then files, alphabetically within each group
    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    if (entries.length === 0) {
      console.log('(empty directory)');
      return;
    }

    // Print header
    const cwdPath = '/' + this.opfsCwd.join('/');
    console.log(`total ${entries.length}  (${cwdPath})`);

    // Format like ls -lla
    const maxSizeLen = Math.max(...entries.map(e => String(e.size).length), 4);
    for (const e of entries) {
      const typeChar = e.kind === 'dir' ? 'd' : '-';
      const perms = e.kind === 'dir' ? 'rwxr-xr-x' : 'rw-r--r--';
      const sizeStr = e.kind === 'dir' ? '-'.padStart(maxSizeLen) : String(e.size).padStart(maxSizeLen);
      console.log(`${typeChar}${perms}  ${sizeStr}  ${e.modified}  ${e.name}`);
    }
  }

  private async opfsCd(path: string): Promise<void> {
    if (!path || path === '') {
      // cd with no args goes to root
      this.opfsCwd = [];
      return;
    }

    let segments: string[];

    if (path === '/') {
      this.opfsCwd = [];
      return;
    } else if (path.startsWith('/')) {
      // Absolute path
      segments = path.split('/').filter(Boolean);
    } else {
      // Relative path
      segments = [...this.opfsCwd, ...path.split('/').filter(Boolean)];
    }

    // Resolve . and ..
    const resolved: string[] = [];
    for (const seg of segments) {
      if (seg === '.') continue;
      if (seg === '..') {
        resolved.pop();
      } else {
        resolved.push(seg);
      }
    }

    // Verify the path exists
    let dir = await navigator.storage.getDirectory();
    for (const seg of resolved) {
      try {
        dir = await dir.getDirectoryHandle(seg);
      } catch {
        console.error(`opfs: cd: no such directory: ${path}`);
        return;
      }
    }

    this.opfsCwd = resolved;
  }

  private async opfsCat(fileName: string): Promise<void> {
    if (!fileName) {
      console.error('opfs: cat: missing file name');
      return;
    }

    const dir = await this.opfsResolveCwd();
    try {
      const fileHandle = await dir.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const text = await file.text();

      // Pretty-print JSON files
      if (fileName.endsWith('.json')) {
        try {
          const parsed = JSON.parse(text);
          console.log(JSON.stringify(parsed, null, 2));
        } catch {
          console.log(text);
        }
      } else {
        console.log(text);
      }
    } catch {
      console.error(`opfs: cat: ${fileName}: No such file`);
    }
  }

  private async opfsDl(fileName: string): Promise<void> {
    if (!fileName) {
      console.error('opfs: dl: missing file name');
      return;
    }

    const dir = await this.opfsResolveCwd();
    try {
      const fileHandle = await dir.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log(`downloaded: ${fileName} (${file.size} bytes)`);
    } catch {
      console.error(`opfs: dl: ${fileName}: No such file`);
    }
  }

  private async opfsRm(name: string): Promise<void> {
    if (!name) {
      console.error('opfs: rm: missing file or directory name');
      return;
    }

    const dir = await this.opfsResolveCwd();
    try {
      await dir.removeEntry(name, { recursive: true });
      console.log(`removed: ${name}`);
    } catch {
      console.error(`opfs: rm: ${name}: No such file or directory`);
    }
  }
}