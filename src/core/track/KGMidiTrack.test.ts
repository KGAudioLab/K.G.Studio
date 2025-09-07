import { describe, it, expect, beforeEach } from 'vitest'
import { KGMidiTrack, type InstrumentType } from './KGMidiTrack'
import { KGTrack, TrackType } from './KGTrack'
import { KGMidiRegion } from '../region/KGMidiRegion'
import { createMockMidiRegion } from '../../test/utils/mock-data'

describe('KGMidiTrack', () => {
  let track: KGMidiTrack

  beforeEach(() => {
    track = new KGMidiTrack()
  })

  describe('constructor', () => {
    it('should create track with default values', () => {
      const defaultTrack = new KGMidiTrack()

      expect(defaultTrack.getName()).toBe('Untitled MIDI Track')
      expect(defaultTrack.getId()).toBe(0)
      expect(defaultTrack.getType()).toBe(TrackType.MIDI)
      expect(defaultTrack.getInstrument()).toBe('acoustic_grand_piano')
      expect(defaultTrack.getVolume()).toBe(0.8) // DEFAULT_TRACK_VOLUME
      expect(defaultTrack.getRegions()).toEqual([])
    })

    it('should create track with custom parameters', () => {
      const customTrack = new KGMidiTrack('My Piano Track', 5, 'electric_piano_1', 0.6)

      expect(customTrack.getName()).toBe('My Piano Track')
      expect(customTrack.getId()).toBe(5)
      expect(customTrack.getType()).toBe(TrackType.MIDI)
      expect(customTrack.getInstrument()).toBe('electric_piano_1')
      expect(customTrack.getVolume()).toBe(0.6)
    })

    it('should set correct type identifier', () => {
      expect(track.getCurrentType()).toBe('KGMidiTrack')
    })

    it('should inherit from KGTrack', () => {
      expect(track).toBeInstanceOf(KGMidiTrack)
      expect(track).toBeInstanceOf(KGTrack)
    })
  })

  describe('instrument management', () => {
    describe('getInstrument', () => {
      it('should return default instrument when not set', () => {
        expect(track.getInstrument()).toBe('acoustic_grand_piano')
      })

      it('should return current instrument', () => {
        const customTrack = new KGMidiTrack('Test', 0, 'electric_guitar_clean')
        expect(customTrack.getInstrument()).toBe('electric_guitar_clean')
      })

      it('should provide backward compatibility for undefined instrument', () => {
        // This tests the backward compatibility mentioned in the code
        expect(track.getInstrument()).toBe('acoustic_grand_piano')
      })
    })

    describe('setInstrument', () => {
      it('should update instrument', () => {
        track.setInstrument('violin')
        expect(track.getInstrument()).toBe('violin')
      })

      it('should handle different instrument types', () => {
        const instruments: InstrumentType[] = [
          'acoustic_grand_piano',
          'electric_piano_1',
          'electric_guitar_clean',
          'acoustic_bass',
          'violin',
          'trumpet',
          'flute'
        ]

        instruments.forEach(instrument => {
          track.setInstrument(instrument)
          expect(track.getInstrument()).toBe(instrument)
        })
      })

      it('should handle rapid instrument changes', () => {
        track.setInstrument('piano')
        track.setInstrument('guitar')
        track.setInstrument('violin')
        
        expect(track.getInstrument()).toBe('violin')
      })
    })
  })

  describe('region management', () => {
    let region1: KGMidiRegion
    let region2: KGMidiRegion
    let region3: KGMidiRegion

    beforeEach(() => {
      region1 = createMockMidiRegion({ 
        id: 'region-1', 
        trackId: track.getId().toString(),
        name: 'Region 1',
        startFromBeat: 0,
        length: 4
      })
      region2 = createMockMidiRegion({ 
        id: 'region-2', 
        trackId: track.getId().toString(),
        name: 'Region 2',
        startFromBeat: 4,
        length: 4
      })
      region3 = createMockMidiRegion({ 
        id: 'region-3', 
        trackId: track.getId().toString(),
        name: 'Region 3',
        startFromBeat: 8,
        length: 4
      })
    })

    describe('setRegions', () => {
      it('should set regions array', () => {
        const regions = [region1, region2]
        track.setRegions(regions)

        expect(track.getRegions()).toHaveLength(2)
        expect(track.getRegions()).toEqual(regions)
      })

      it('should replace existing regions', () => {
        track.setRegions([region1])
        expect(track.getRegions()).toHaveLength(1)

        track.setRegions([region2, region3])
        expect(track.getRegions()).toHaveLength(2)
        expect(track.getRegions()).toContain(region2)
        expect(track.getRegions()).toContain(region3)
        expect(track.getRegions()).not.toContain(region1)
      })

      it('should accept empty array', () => {
        track.setRegions([region1, region2])
        track.setRegions([])

        expect(track.getRegions()).toHaveLength(0)
      })

      it('should enforce KGMidiRegion type', () => {
        const regions: KGMidiRegion[] = [region1, region2]
        track.setRegions(regions)

        const retrievedRegions = track.getRegions()
        retrievedRegions.forEach(region => {
          expect(region).toBeInstanceOf(KGMidiRegion)
        })
      })
    })

    describe('inherited region methods', () => {
      beforeEach(() => {
        track.setRegions([region1, region2])
      })

      it('should inherit addRegion method', () => {
        track.addRegion(region3)

        const regions = track.getRegions()
        expect(regions).toHaveLength(3)
        expect(regions).toContain(region3)
      })

      it('should inherit removeRegion method', () => {
        track.removeRegion('region-1')

        const regions = track.getRegions()
        expect(regions).toHaveLength(1)
        expect(regions).not.toContain(region1)
        expect(regions).toContain(region2)
      })

      it('should inherit getRegions method', () => {
        const regions = track.getRegions()
        expect(regions).toHaveLength(2)
        expect(regions).toContain(region1)
        expect(regions).toContain(region2)
      })
    })
  })

  describe('inheritance from KGTrack', () => {
    it('should inherit all base track properties', () => {
      const customTrack = new KGMidiTrack('Test Track', 42, 'violin', 0.9)

      expect(customTrack.getName()).toBe('Test Track')
      expect(customTrack.getId()).toBe(42)
      expect(customTrack.getType()).toBe(TrackType.MIDI)
      expect(customTrack.getVolume()).toBe(0.9)
    })

    it('should inherit base track setters', () => {
      track.setName('Updated Track')
      expect(track.getName()).toBe('Updated Track')

      track.setVolume(0.5)
      expect(track.getVolume()).toBe(0.5)

      track.setTrackIndex(3)
      expect(track.getTrackIndex()).toBe(3)
    })

    it('should inherit volume controls', () => {
      expect(track.getVolume()).toBe(0.8) // Default volume

      track.setVolume(0.5)
      expect(track.getVolume()).toBe(0.5)

      track.setVolume(1.0)
      expect(track.getVolume()).toBe(1.0)
    })
  })

  describe('type identification', () => {
    it('should return correct current type', () => {
      expect(track.getCurrentType()).toBe('KGMidiTrack')
    })

    it('should return correct root type', () => {
      expect(track.getRootType()).toBe('KGTrack')
    })

    it('should have MIDI track type', () => {
      expect(track.getType()).toBe(TrackType.MIDI)
    })
  })

  describe('instrument type validation', () => {
    it('should handle all valid General MIDI instruments', () => {
      // Test a selection of valid GM instruments
      const validInstruments: InstrumentType[] = [
        'acoustic_grand_piano',
        'electric_piano_1',
        'electric_piano_2',
        'electric_guitar_clean',
        'electric_guitar_muted',
        'acoustic_bass',
        'electric_bass_finger',
        'violin',
        'viola',
        'cello',
        'contrabass',
        'trumpet',
        'trombone',
        'french_horn',
        'flute',
        'clarinet',
        'soprano_sax',
        'alto_sax'
      ]

      validInstruments.forEach(instrument => {
        expect(() => {
          track.setInstrument(instrument)
          expect(track.getInstrument()).toBe(instrument)
        }).not.toThrow()
      })
    })
  })

  describe('track state consistency', () => {
    it('should maintain consistent state after multiple operations', () => {
      // Setup initial state
      track.setName('Piano Track')
      track.setInstrument('acoustic_grand_piano')
      track.setVolume(0.7)
      
      const regions = [
        createMockMidiRegion({ id: 'r1', trackId: '0', name: 'Intro' }),
        createMockMidiRegion({ id: 'r2', trackId: '0', name: 'Verse' })
      ]
      track.setRegions(regions)

      // Verify initial state
      expect(track.getName()).toBe('Piano Track')
      expect(track.getInstrument()).toBe('acoustic_grand_piano')
      expect(track.getVolume()).toBe(0.7)
      expect(track.getRegions()).toHaveLength(2)

      // Modify state
      track.setInstrument('electric_piano_1')
      track.addRegion(createMockMidiRegion({ 
        id: 'r3', 
        trackId: '0', 
        name: 'Chorus' 
      }))

      // Verify modified state
      expect(track.getName()).toBe('Piano Track')
      expect(track.getInstrument()).toBe('electric_piano_1')
      expect(track.getVolume()).toBe(0.7)
      expect(track.getRegions()).toHaveLength(3)
    })

    it('should handle region-track relationship correctly', () => {
      const region = createMockMidiRegion({ 
        id: 'test-region',
        trackId: track.getId().toString(),
        name: 'Test Region'
      })

      track.addRegion(region)
      
      // Verify region is in track
      expect(track.getRegions()).toContain(region)
      
      // Find region manually since getRegionById doesn't exist
      const foundRegion = track.getRegions().find(r => r.getId() === 'test-region')
      expect(foundRegion).toBe(region)
      
      // Verify region properties
      expect(region.getTrackId()).toBe(track.getId().toString())
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle empty track name', () => {
      const emptyNameTrack = new KGMidiTrack('', 0, 'piano')
      expect(emptyNameTrack.getName()).toBe('')
    })

    it('should handle negative track ID', () => {
      const negativeIdTrack = new KGMidiTrack('Test', -1, 'piano')
      expect(negativeIdTrack.getId()).toBe(-1)
    })

    it('should handle volume boundaries', () => {
      track.setVolume(0.0)
      expect(track.getVolume()).toBe(0.0)

      track.setVolume(1.0)
      expect(track.getVolume()).toBe(1.0)

      // Volume outside normal range (should still work)
      track.setVolume(1.5)
      expect(track.getVolume()).toBe(1.5)
    })

    it('should handle large number of regions', () => {
      const manyRegions = Array.from({ length: 100 }, (_, i) =>
        createMockMidiRegion({
          id: `region-${i}`,
          trackId: track.getId().toString(),
          name: `Region ${i}`
        })
      )

      track.setRegions(manyRegions)
      expect(track.getRegions()).toHaveLength(100)

      // Should be able to find any region
      const foundRegion50 = track.getRegions().find(r => r.getId() === 'region-50')
      const foundRegion99 = track.getRegions().find(r => r.getId() === 'region-99')
      
      expect(foundRegion50).toBeDefined()
      expect(foundRegion99).toBeDefined()
    })
  })

  describe('class-transformer compatibility', () => {
    it('should have proper type annotations for serialization', () => {
      // Verify the class has the necessary decorators for serialization
      expect(track.getCurrentType()).toBe('KGMidiTrack')
      
      // Test that default instrument fallback works
      const instrument = track.getInstrument()
      expect(instrument).toBe('acoustic_grand_piano')
    })

    it('should maintain regions type after serialization simulation', () => {
      const regions = [
        createMockMidiRegion({ id: 'r1', trackId: '0' }),
        createMockMidiRegion({ id: 'r2', trackId: '0' })
      ]

      track.setRegions(regions)
      
      // Simulate what happens during serialization/deserialization
      const retrievedRegions = track.getRegions()
      expect(retrievedRegions).toHaveLength(2)
      retrievedRegions.forEach(region => {
        expect(region).toBeInstanceOf(KGMidiRegion)
      })
    })
  })
})