import { describe, it, expect } from 'vitest'
import { extractXMLFromString, wrapXmlBlocksInContent } from './xmlUtil'
import {
  longTextWithAddNotes,
  longTextWithReadMusic,
  multipleXmlBlocks,
  nestedXmlContent,
  xmlWithAttributes,
  malformedXml,
  noXmlContent,
  emptyAndWhitespaceXml
} from '../test/fixtures/xml-samples'

describe('xmlUtil', () => {
  describe('extractXMLFromString', () => {
    it('should extract simple XML blocks', () => {
      const input = `Here is some text with <test>content</test> and more text.`
      const result = extractXMLFromString(input)
      
      expect(result).toHaveLength(1)
      expect(result[0]).toBe('<test>content</test>')
    })

    it('should extract multiple XML blocks', () => {
      const input = `<first>content1</first> some text <second>content2</second>`
      const result = extractXMLFromString(input)
      
      expect(result).toHaveLength(2)
      expect(result[0]).toBe('<first>content1</first>')
      expect(result[1]).toBe('<second>content2</second>')
    })

    it('should extract XML blocks with nested elements', () => {
      const input = `<outer><inner>nested content</inner></outer>`
      const result = extractXMLFromString(input)
      
      expect(result).toHaveLength(1)
      expect(result[0]).toBe('<outer><inner>nested content</inner></outer>')
    })

    it('should extract XML blocks with attributes', () => {
      const input = `<tag attr="value" id="123">content</tag>`
      const result = extractXMLFromString(input)
      
      expect(result).toHaveLength(1)
      expect(result[0]).toBe('<tag attr="value" id="123">content</tag>')
    })

    it('should handle multiline XML blocks', () => {
      const input = `<multiline>
  <line1>content1</line1>
  <line2>content2</line2>
</multiline>`
      const result = extractXMLFromString(input)
      
      expect(result).toHaveLength(1)
      expect(result[0]).toContain('<multiline>')
      expect(result[0]).toContain('<line1>content1</line1>')
      expect(result[0]).toContain('<line2>content2</line2>')
      expect(result[0]).toContain('</multiline>')
    })

    it('should extract XML from complex nested content fixture', () => {
      const result = extractXMLFromString(nestedXmlContent)
      
      expect(result).toHaveLength(1)
      expect(result[0]).toContain('<container>')
      expect(result[0]).toContain('<inner_element>')
      expect(result[0]).toContain('<deep_nested>')
      expect(result[0]).toContain('<value>Test Content</value>')
      expect(result[0]).toContain('</container>')
    })

    it('should extract multiple XML blocks from fixture', () => {
      const result = extractXMLFromString(multipleXmlBlocks)
      
      expect(result).toHaveLength(3)
      expect(result[0]).toContain('<add_notes>')
      expect(result[0]).toContain('</add_notes>')
      expect(result[1]).toContain('<read_music>')
      expect(result[1]).toContain('</read_music>')
      expect(result[2]).toContain('<modify_tempo>')
      expect(result[2]).toContain('</modify_tempo>')
    })

    it('should extract XML with attributes from fixture', () => {
      const result = extractXMLFromString(xmlWithAttributes)
      
      expect(result).toHaveLength(1)
      expect(result[0]).toContain('region_id="main"')
      expect(result[0]).toContain('track="melody"')
      expect(result[0]).toContain('id="1"')
      expect(result[0]).toContain('velocity="127"')
    })

    it('should handle the long text with add_notes fixture (Case 1)', () => {
      const result = extractXMLFromString(longTextWithAddNotes)
      
      expect(result).toHaveLength(2) // Contains thinking tag and add_notes block
      
      // Find the add_notes block
      const addNotesBlock = result.find(block => block.includes('<add_notes>'))
      expect(addNotesBlock).toBeDefined()
      expect(addNotesBlock).toContain('<notes>')
      expect(addNotesBlock).toContain('<note>')
      expect(addNotesBlock).toContain('<pitch>C4</pitch>')
      expect(addNotesBlock).toContain('<start_beat>0</start_beat>')
      expect(addNotesBlock).toContain('<length>4</length>')
      expect(addNotesBlock).toContain('</add_notes>')
      
      // Should contain all 12 notes
      const noteMatches = addNotesBlock!.match(/<note>/g)
      expect(noteMatches).toHaveLength(12)
    })

    it('should handle the long text with read_music fixture (Case 2)', () => {
      const result = extractXMLFromString(longTextWithReadMusic)
      
      expect(result).toHaveLength(2)
      
      // First XML block (inside thinking tag)
      expect(result[0]).toContain('<read_music>')
      expect(result[0]).toContain('<start_beat>0</start_beat>')
      expect(result[0]).toContain('<length>32</length>')
      expect(result[0]).toContain('</read_music>')
      
      // Second XML block (at the end)
      expect(result[1]).toContain('<read_music>')
      expect(result[1]).toContain('<start_beat>0</start_beat>')
      expect(result[1]).toContain('<length>32</length>')
      expect(result[1]).toContain('</read_music>')
    })

    it('should handle malformed XML gracefully', () => {
      const result = extractXMLFromString(malformedXml)
      
      // Should extract valid XML blocks (ignores malformed ones)
      expect(result.length).toBeGreaterThanOrEqual(1)
      
      // Find the definitely valid block
      const validBlock = result.find(block => block.includes('<valid_tag>'))
      expect(validBlock).toBeDefined()
      expect(validBlock).toContain('<content>This is valid</content>')
    })

    it('should return empty array for content with no XML', () => {
      const result = extractXMLFromString(noXmlContent)
      
      expect(result).toHaveLength(0)
      expect(result).toEqual([])
    })

    it('should handle empty and whitespace XML', () => {
      const result = extractXMLFromString(emptyAndWhitespaceXml)
      
      expect(result).toHaveLength(3)
      expect(result[0]).toBe('<empty_tag></empty_tag>')
      expect(result[1]).toContain('<whitespace_tag>')
      expect(result[1]).toContain('</whitespace_tag>')
      expect(result[2]).toContain('<mixed_content>')
      expect(result[2]).toContain('Some text with   spaces')
      expect(result[2]).toContain('</mixed_content>')
    })

    it('should handle XML with underscores and hyphens in tag names', () => {
      const input = `<tag_name>content</tag_name> and <tag-name>content</tag-name>`
      const result = extractXMLFromString(input)
      
      expect(result).toHaveLength(2)
      expect(result[0]).toBe('<tag_name>content</tag_name>')
      expect(result[1]).toBe('<tag-name>content</tag-name>')
    })

    it('should handle self-closing tags (not currently supported)', () => {
      const input = `<self-closing /> and <normal>content</normal>`
      const result = extractXMLFromString(input)
      
      // Current implementation doesn't support self-closing tags
      expect(result).toHaveLength(1)
      expect(result[0]).toBe('<normal>content</normal>')
    })

    it('should trim whitespace around extracted XML', () => {
      const input = `   <tag>content</tag>   `
      const result = extractXMLFromString(input)
      
      expect(result).toHaveLength(1)
      expect(result[0]).toBe('<tag>content</tag>')
    })
  })

  describe('wrapXmlBlocksInContent', () => {
    it('should wrap single XML block in fenced code block', () => {
      const input = `Here is <test>content</test> in text.`
      const result = wrapXmlBlocksInContent(input)
      
      expect(result).toBe('Here is ```xml\n<test>content</test>\n``` in text.')
    })

    it('should wrap multiple XML blocks', () => {
      const input = `<first>content1</first> text <second>content2</second>`
      const result = wrapXmlBlocksInContent(input)
      
      expect(result).toContain('```xml\n<first>content1</first>\n```')
      expect(result).toContain('```xml\n<second>content2</second>\n```')
    })

    it('should return original content when no XML blocks present', () => {
      const input = noXmlContent
      const result = wrapXmlBlocksInContent(input)
      
      expect(result).toBe(input)
    })

    it('should handle empty input', () => {
      expect(wrapXmlBlocksInContent('')).toBe('')
      expect(wrapXmlBlocksInContent(null as any)).toBeNull()
      expect(wrapXmlBlocksInContent(undefined as any)).toBeUndefined()
    })

    it('should wrap XML blocks from multipleXmlBlocks fixture', () => {
      const result = wrapXmlBlocksInContent(multipleXmlBlocks)
      
      expect(result).toContain('```xml\n<add_notes>')
      expect(result).toContain('</add_notes>\n```')
      expect(result).toContain('```xml\n<read_music>')
      expect(result).toContain('</read_music>\n```')
      expect(result).toContain('```xml\n<modify_tempo>')
      expect(result).toContain('</modify_tempo>\n```')
      
      // Should preserve the surrounding text
      expect(result).toContain('Here\'s how to add multiple musical elements:')
      expect(result).toContain('First, let\'s add some notes:')
      expect(result).toContain('Then we can read the current music:')
    })

    it('should wrap the long add_notes XML block (Case 1)', () => {
      const result = wrapXmlBlocksInContent(longTextWithAddNotes)
      
      expect(result).toContain('```xml\n<add_notes>')
      expect(result).toContain('</add_notes>\n```')
      
      // Should preserve the thinking content and other text
      expect(result).toContain('<thinking>')
      expect(result).toContain('Perfect! I can see this is a beautiful')
      expect(result).toContain('Let me start by adding the harmony')
    })

    it('should wrap the long read_music XML blocks (Case 2)', () => {
      const result = wrapXmlBlocksInContent(longTextWithReadMusic)
      
      // Should contain two wrapped XML blocks
      const fencedBlocks = result.match(/```xml\n<read_music>[\s\S]*?<\/read_music>\n```/g)
      expect(fencedBlocks).toHaveLength(2)
      
      // Should preserve the thinking content and other text
      expect(result).toContain('<thinking>')
      expect(result).toContain('I\'ll help you create a pad harmony track')
      expect(result).toContain('Let me first read the existing music')
    })

    it('should handle nested XML correctly', () => {
      const result = wrapXmlBlocksInContent(nestedXmlContent)
      
      expect(result).toContain('```xml\n<container>')
      expect(result).toContain('<inner_element>')
      expect(result).toContain('<deep_nested>')
      expect(result).toContain('<value>Test Content</value>')
      expect(result).toContain('</container>\n```')
    })

    it('should preserve XML block integrity when wrapping', () => {
      const input = `Text before\n<complex>\n  <nested>value</nested>\n  <another>content</another>\n</complex>\nText after`
      const result = wrapXmlBlocksInContent(input)
      
      expect(result).toBe(`Text before\n\`\`\`xml\n<complex>\n  <nested>value</nested>\n  <another>content</another>\n</complex>\n\`\`\`\nText after`)
    })

    it('should handle duplicate XML blocks correctly', () => {
      const input = `<same>content</same> and then <same>content</same> again`
      const result = wrapXmlBlocksInContent(input)
      
      // Both instances should be wrapped
      const wrappedBlocks = result.match(/```xml\n<same>content<\/same>\n```/g)
      expect(wrappedBlocks).toHaveLength(2)
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle very large XML blocks', () => {
      const largeContent = 'x'.repeat(10000)
      const input = `<large>${largeContent}</large>`
      
      const extracted = extractXMLFromString(input)
      expect(extracted).toHaveLength(1)
      expect(extracted[0]).toContain(largeContent)
      
      const wrapped = wrapXmlBlocksInContent(input)
      expect(wrapped).toContain('```xml\n<large>')
      expect(wrapped).toContain('</large>\n```')
    })

    it('should handle XML with special characters', () => {
      const input = `<tag>Content with &lt; &gt; &amp; &quot; &apos;</tag>`
      
      const extracted = extractXMLFromString(input)
      expect(extracted).toHaveLength(1)
      expect(extracted[0]).toContain('&lt; &gt; &amp; &quot; &apos;')
      
      const wrapped = wrapXmlBlocksInContent(input)
      expect(wrapped).toContain('```xml\n<tag>Content with &lt; &gt; &amp; &quot; &apos;</tag>\n```')
    })

    it('should handle XML with CDATA sections', () => {
      const input = `<tag><![CDATA[Some content with <special> chars]]></tag>`
      
      const extracted = extractXMLFromString(input)
      expect(extracted).toHaveLength(1)
      expect(extracted[0]).toContain('<![CDATA[')
      expect(extracted[0]).toContain(']]>')
    })

    it('should handle mixed content with partial XML-like text', () => {
      const input = `This < is not XML and neither > is this <incomplete and <valid>content</valid> is valid`
      
      const extracted = extractXMLFromString(input)
      expect(extracted).toHaveLength(1)
      expect(extracted[0]).toBe('<valid>content</valid>')
    })
  })
})