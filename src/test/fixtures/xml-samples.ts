// Test fixtures for XML utility testing

export const longTextWithAddNotes = `<thinking>
Now I can see the melody! This is a beautiful classical-style melody in C major. Let me analyze it:

First 4 bars (beats 0-16):
- Bar 1: E E F G (likely suggesting C major - Am - F - C progressions)
- Bar 2: G F E D (descending line, could work with G - F - C)
- Bar 3: C C D E (starting on tonic, building up)
- Bar 4: E3/2 D1/2 D2 (resolution to D, suggesting dominant function)

Last 4 bars (beats 16-32):
- Bar 5: E E F G (similar to bar 1)
- Bar 6: G F E D (similar to bar 2) 
- Bar 7: C C D E (similar to bar 3)
- Bar 8: D3/2 C1/2 C2 (final resolution to C)

This looks like "Ode to Joy" or a similar classical melody. For the harmony, I should:

1. First 4 bars (soft and light): Use simple triads in root position or gentle inversions
2. Last 4 bars (fuller and brighter): Add some extensions, maybe use inversions for smoother voice leading, and possibly add an additional voice

Let me think about chord progressions:
- Bar 1 (E E F G): C major works well
- Bar 2 (G F E D): G major (dominant) 
- Bar 3 (C C D E): F major or Am could work
- Bar 4 (E D D): G major resolving the phrase

For the second half, I can use similar progressions but make them richer.

I'll start with the first 4 bars, keeping them light with simple triads in a comfortable mid-range.
</thinking>

Perfect! I can see this is a beautiful classical-style melody. Let me analyze the harmonic structure and create a supportive pad harmony track.

For the first four bars, I'll use gentle, simple triads to support the melody without overpowering it. For the last four bars, I'll add more fullness and brightness while maintaining harmonic support.

Let me start by adding the harmony for the first four bars (beats 0-16):

<add_notes>
<notes>
<note>
<pitch>C4</pitch>
<start_beat>0</start_beat>
<length>4</length>
</note>
<note>
<pitch>E4</pitch>
<start_beat>0</start_beat>
<length>4</length>
</note>
<note>
<pitch>G4</pitch>
<start_beat>0</start_beat>
<length>4</length>
</note>
<note>
<pitch>G3</pitch>
<start_beat>4</start_beat>
<length>4</length>
</note>
<note>
<pitch>B3</pitch>
<start_beat>4</start_beat>
<length>4</length>
</note>
<note>
<pitch>D4</pitch>
<start_beat>4</start_beat>
<length>4</length>
</note>
<note>
<pitch>A3</pitch>
<start_beat>8</start_beat>
<length>4</length>
</note>
<note>
<pitch>C4</pitch>
<start_beat>8</start_beat>
<length>4</length>
</note>
<note>
<pitch>E4</pitch>
<start_beat>8</start_beat>
<length>4</length>
</note>
<note>
<pitch>G3</pitch>
<start_beat>12</start_beat>
<length>4</length>
</note>
<note>
<pitch>B3</pitch>
<start_beat>12</start_beat>
<length>4</length>
</note>
<note>
<pitch>D4</pitch>
<start_beat>12</start_beat>
<length>4</length>
</note>
</notes>
</add_notes>`;

export const longTextWithReadMusic = `<thinking>
I need to create a pad harmony track for an existing melody. First, I should read the music to see what melody I'm working with, then analyze its harmonic structure to create appropriate pad chords. The user wants the first four bars (beats 0-16) to be soft and light, and the last four bars (beats 16-32) to be fuller and brighter while remaining supportive.
<read_music>
<start_beat>0</start_beat>
<length>32</length>
</read_music>
Let me start by reading the current music to understand the melody I'm harmonizing.
</thinking>

I'll help you create a pad harmony track for your melody. Let me first read the existing music to understand the melodic content and structure.

<read_music>
<start_beat>0</start_beat>
<length>32</length>
</read_music>`;

export const multipleXmlBlocks = `Here's how to add multiple musical elements:

First, let's add some notes:
<add_notes>
<notes>
<note>
<pitch>C4</pitch>
<start_beat>0</start_beat>
<length>2</length>
</note>
</notes>
</add_notes>

Then we can read the current music:
<read_music>
<start_beat>0</start_beat>
<length>8</length>
</read_music>

Finally, let's modify the tempo:
<modify_tempo>
<bpm>120</bpm>
</modify_tempo>

That's how you work with multiple XML commands!`;

export const nestedXmlContent = `<container>
<inner_element>
<deep_nested>
<value>Test Content</value>
</deep_nested>
</inner_element>
<another_element>
<data>More content here</data>
</another_element>
</container>`;

export const xmlWithAttributes = `Here's an XML block with attributes:

<add_notes region_id="main" track="melody">
<notes>
<note id="1" velocity="127">
<pitch>C4</pitch>
<start_beat>0</start_beat>
<length>1</length>
</note>
</notes>
</add_notes>

That was an example with attributes.`;

export const malformedXml = `This contains some malformed XML:
<unclosed_tag>
<properly_closed>content</properly_closed>
<another_unclosed>
<mismatched_tag>content</wrong_tag>

But this should work:
<valid_tag>
<content>This is valid</content>
</valid_tag>`;

export const noXmlContent = `This is just plain text content without any XML blocks.
It contains some angle brackets like <this> and </that> but no complete XML elements.
Also some <incomplete tags and random characters.`;

export const emptyAndWhitespaceXml = `
<empty_tag></empty_tag>

<whitespace_tag>   
   
</whitespace_tag>

<mixed_content>
  Some text with   spaces
</mixed_content>
`;