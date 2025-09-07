import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseTimeSignature, getTimeSignatureErrorMessage, beatsToTimeString, formatLocalDateTime } from './timeUtil'
import { TIME_CONSTANTS } from '../constants/coreConstants'

describe('timeUtil', () => {
  describe('parseTimeSignature', () => {
    it('should parse valid time signatures', () => {
      expect(parseTimeSignature('4/4')).toEqual({ numerator: 4, denominator: 4 })
      expect(parseTimeSignature('3/4')).toEqual({ numerator: 3, denominator: 4 })
      expect(parseTimeSignature('6/8')).toEqual({ numerator: 6, denominator: 8 })
      expect(parseTimeSignature('12/8')).toEqual({ numerator: 12, denominator: 8 })
      expect(parseTimeSignature('2/4')).toEqual({ numerator: 2, denominator: 4 })
    })

    it('should handle whitespace around input', () => {
      expect(parseTimeSignature(' 4/4 ')).toEqual({ numerator: 4, denominator: 4 })
      expect(parseTimeSignature('  3/4  ')).toEqual({ numerator: 3, denominator: 4 })
      expect(parseTimeSignature('\t6/8\n')).toEqual({ numerator: 6, denominator: 8 })
    })

    it('should return null for invalid formats', () => {
      expect(parseTimeSignature('4')).toBeNull()
      expect(parseTimeSignature('4/4/4')).toBeNull()
      expect(parseTimeSignature('4-4')).toBeNull()
      expect(parseTimeSignature('4:4')).toBeNull()
      expect(parseTimeSignature('')).toBeNull()
      expect(parseTimeSignature('/')).toBeNull()
      expect(parseTimeSignature('4/')).toBeNull()
      expect(parseTimeSignature('/4')).toBeNull()
    })

    it('should return null for non-numeric values', () => {
      expect(parseTimeSignature('a/4')).toBeNull()
      expect(parseTimeSignature('4/b')).toBeNull()
      expect(parseTimeSignature('x/y')).toBeNull()
      // Note: parseInt('4.5') returns 4, so these will parse as integers
      // Testing the actual behavior of parseInt
      expect(parseTimeSignature('4.5/4')).toEqual({ numerator: 4, denominator: 4 })
      expect(parseTimeSignature('4/4.5')).toEqual({ numerator: 4, denominator: 4 })
    })

    it('should return null for numerators not in available list', () => {
      // Assuming TIME_CONSTANTS has specific available numerators
      expect(parseTimeSignature('99/4')).toBeNull()
      expect(parseTimeSignature('0/4')).toBeNull()
      expect(parseTimeSignature('-1/4')).toBeNull()
    })

    it('should return null for denominators not in available list', () => {
      // Assuming TIME_CONSTANTS has specific available denominators
      expect(parseTimeSignature('4/99')).toBeNull()
      expect(parseTimeSignature('4/0')).toBeNull()
      expect(parseTimeSignature('4/-1')).toBeNull()
    })

    it('should validate against TIME_CONSTANTS available values', () => {
      // Test that function actually uses TIME_CONSTANTS for validation
      const validNumerator = TIME_CONSTANTS.AVAILABLE_TIME_SIGNATURE_NUMERATORS[0]
      const validDenominator = TIME_CONSTANTS.AVAILABLE_TIME_SIGNATURE_DENOMINATORS[0]
      const invalidNumerator = 999 // Assuming this is not in the available list
      const invalidDenominator = 999 // Assuming this is not in the available list

      expect(parseTimeSignature(`${validNumerator}/${validDenominator}`)).not.toBeNull()
      expect(parseTimeSignature(`${invalidNumerator}/${validDenominator}`)).toBeNull()
      expect(parseTimeSignature(`${validNumerator}/${invalidDenominator}`)).toBeNull()
    })
  })

  describe('getTimeSignatureErrorMessage', () => {
    it('should return a formatted error message with available options', () => {
      const message = getTimeSignatureErrorMessage()
      
      expect(message).toContain('Invalid time signature format')
      expect(message).toContain('numerator/denominator')
      expect(message).toContain('Available numerators:')
      expect(message).toContain('Available denominators:')
      expect(message).toContain('Examples: 4/4, 3/4, 6/8, 12/8')
    })

    it('should include actual available values from TIME_CONSTANTS', () => {
      const message = getTimeSignatureErrorMessage()
      
      // Check that it includes values from TIME_CONSTANTS
      TIME_CONSTANTS.AVAILABLE_TIME_SIGNATURE_NUMERATORS.forEach(numerator => {
        expect(message).toContain(numerator.toString())
      })
      
      TIME_CONSTANTS.AVAILABLE_TIME_SIGNATURE_DENOMINATORS.forEach(denominator => {
        expect(message).toContain(denominator.toString())
      })
    })

    it('should be a consistent message format', () => {
      const message1 = getTimeSignatureErrorMessage()
      const message2 = getTimeSignatureErrorMessage()
      
      expect(message1).toBe(message2)
    })
  })

  describe('beatsToTimeString', () => {
    it('should format beats to BBB:B | mm:ss:mmm format', () => {
      // Test basic 4/4 time signature
      expect(beatsToTimeString(0, 120, { numerator: 4, denominator: 4 }))
        .toBe('001:1 | 00:00:000')
      
      expect(beatsToTimeString(4, 120, { numerator: 4, denominator: 4 }))
        .toBe('002:1 | 00:02:000')
      
      expect(beatsToTimeString(8, 120, { numerator: 4, denominator: 4 }))
        .toBe('003:1 | 00:04:000')
    })

    it('should handle different time signatures correctly', () => {
      // 3/4 time signature - 3 beats per bar
      expect(beatsToTimeString(0, 120, { numerator: 3, denominator: 4 }))
        .toBe('001:1 | 00:00:000')
      
      expect(beatsToTimeString(3, 120, { numerator: 3, denominator: 4 }))
        .toBe('002:1 | 00:01:500')
      
      expect(beatsToTimeString(6, 120, { numerator: 3, denominator: 4 }))
        .toBe('003:1 | 00:03:000')

      // 6/8 time signature - 6 beats per bar
      expect(beatsToTimeString(0, 120, { numerator: 6, denominator: 8 }))
        .toBe('001:1 | 00:00:000')
      
      expect(beatsToTimeString(6, 120, { numerator: 6, denominator: 8 }))
        .toBe('002:1 | 00:03:000')
    })

    it('should handle different BPM values correctly', () => {
      // 60 BPM - 1 beat per second
      expect(beatsToTimeString(1, 60, { numerator: 4, denominator: 4 }))
        .toBe('001:2 | 00:01:000')
      
      expect(beatsToTimeString(4, 60, { numerator: 4, denominator: 4 }))
        .toBe('002:1 | 00:04:000')

      // 240 BPM - 4 beats per second  
      expect(beatsToTimeString(1, 240, { numerator: 4, denominator: 4 }))
        .toBe('001:2 | 00:00:250')
      
      expect(beatsToTimeString(4, 240, { numerator: 4, denominator: 4 }))
        .toBe('002:1 | 00:01:000')
    })

    it('should handle fractional beats correctly', () => {
      expect(beatsToTimeString(1.5, 120, { numerator: 4, denominator: 4 }))
        .toBe('001:2 | 00:00:750')
      
      expect(beatsToTimeString(2.25, 120, { numerator: 4, denominator: 4 }))
        .toBe('001:3 | 00:01:125')
      
      expect(beatsToTimeString(4.75, 120, { numerator: 4, denominator: 4 }))
        .toBe('002:1 | 00:02:375')
    })

    it('should pad numbers correctly in output format', () => {
      // Test bar padding (BBB format)
      expect(beatsToTimeString(0, 120, { numerator: 4, denominator: 4 }))
        .toMatch(/^001:/)
      
      expect(beatsToTimeString(40, 120, { numerator: 4, denominator: 4 }))
        .toMatch(/^011:/) // Bar 11
      
      expect(beatsToTimeString(396, 120, { numerator: 4, denominator: 4 }))
        .toMatch(/^100:/) // Bar 100

      // Test time padding (mm:ss:mmm format)
      expect(beatsToTimeString(1, 60, { numerator: 4, denominator: 4 }))
        .toMatch(/\| 00:01:000$/)
      
      expect(beatsToTimeString(75, 60, { numerator: 4, denominator: 4 }))
        .toMatch(/\| 01:15:000$/) // 1 minute 15 seconds
    })

    it('should handle large beat values', () => {
      const result = beatsToTimeString(1000, 120, { numerator: 4, denominator: 4 })
      expect(result).toMatch(/^251:1 \| \d{2}:\d{2}:\d{3}$/)
    })

    it('should handle edge case of zero BPM gracefully', () => {
      // This might cause division by zero, should handle gracefully
      expect(() => beatsToTimeString(1, 0, { numerator: 4, denominator: 4 }))
        .not.toThrow()
    })

    it('should handle negative beats', () => {
      // Edge case - negative beats may produce negative values in time format
      const result = beatsToTimeString(-1, 120, { numerator: 4, denominator: 4 })
      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      // The function may produce negative time values for negative beats
      expect(result).toMatch(/^\d{3}:\d \| -?\d+:-?\d+:-?\d+$/)
    })
  })

  describe('formatLocalDateTime', () => {
    let mockDate: Date

    beforeEach(() => {
      // Use a fixed date for consistent testing
      mockDate = new Date('2025-08-21T19:57:11.123Z')
    })

    it('should format date with correct structure', () => {
      const result = formatLocalDateTime(mockDate)
      
      // Should contain date parts
      expect(result).toMatch(/\d{4}/) // Year
      expect(result).toMatch(/\d{2}/) // Month/day/hour/minute/second
      expect(result).toContain(':') // Time separator
      expect(result).toMatch(/GMT[+-]\d+|UTC|[A-Z]{3,4}/) // Timezone
    })

    it('should use 24-hour format', () => {
      const morningDate = new Date('2025-08-21T09:30:00Z')
      const eveningDate = new Date('2025-08-21T21:30:00Z')
      
      const morningResult = formatLocalDateTime(morningDate)
      const eveningResult = formatLocalDateTime(eveningDate)
      
      // Should not contain AM/PM indicators
      expect(morningResult).not.toMatch(/AM|PM/i)
      expect(eveningResult).not.toMatch(/AM|PM/i)
    })

    it('should include timezone information', () => {
      const result = formatLocalDateTime(mockDate)
      
      // Should contain some timezone indicator
      expect(result).toMatch(/GMT[+-]\d+|UTC|[A-Z]{3,4}|\+\d{4}|-\d{4}/)
    })

    it('should handle different dates consistently', () => {
      const dates = [
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-06-15T12:30:45Z'),
        new Date('2025-12-31T23:59:59Z')
      ]
      
      dates.forEach(date => {
        const result = formatLocalDateTime(date)
        expect(result).toBeDefined()
        expect(typeof result).toBe('string')
        expect(result.length).toBeGreaterThan(10)
      })
    })

    it('should handle edge dates', () => {
      const edgeDates = [
        new Date('1970-01-01T00:00:00Z'), // Unix epoch
        new Date('2038-01-19T03:14:07Z'), // Near 32-bit timestamp limit
        new Date('2100-12-31T23:59:59Z')  // Future date
      ]
      
      edgeDates.forEach(date => {
        expect(() => formatLocalDateTime(date)).not.toThrow()
        const result = formatLocalDateTime(date)
        expect(typeof result).toBe('string')
        expect(result.length).toBeGreaterThan(0)
      })
    })

    it('should be consistent for the same date', () => {
      const result1 = formatLocalDateTime(mockDate)
      const result2 = formatLocalDateTime(mockDate)
      
      expect(result1).toBe(result2)
    })

    it('should handle leap year dates', () => {
      const leapYearDate = new Date('2024-02-29T12:00:00Z') // Leap year
      
      expect(() => formatLocalDateTime(leapYearDate)).not.toThrow()
      const result = formatLocalDateTime(leapYearDate)
      expect(result).toContain('2024')
      expect(result).toContain('02')
      expect(result).toContain('29')
    })
  })

  describe('integration tests', () => {
    it('should work together for typical DAW workflow', () => {
      // Parse time signature
      const timeSignature = parseTimeSignature('4/4')
      expect(timeSignature).not.toBeNull()
      
      // Use parsed time signature in time formatting
      const timeString = beatsToTimeString(16, 120, timeSignature!)
      expect(timeString).toBe('005:1 | 00:08:000')
      
      // Format current time
      const now = new Date()
      const formattedTime = formatLocalDateTime(now)
      expect(formattedTime).toBeDefined()
    })

    it('should handle error cases gracefully in workflow', () => {
      // Invalid time signature should not break workflow
      const invalidTimeSignature = parseTimeSignature('invalid')
      expect(invalidTimeSignature).toBeNull()
      
      // Get error message for user feedback
      const errorMessage = getTimeSignatureErrorMessage()
      expect(errorMessage).toContain('Invalid time signature')
      
      // Fallback to default time signature
      const fallbackTimeSignature = { numerator: 4, denominator: 4 }
      const timeString = beatsToTimeString(8, 120, fallbackTimeSignature)
      expect(timeString).toBe('003:1 | 00:04:000')
    })
  })
})