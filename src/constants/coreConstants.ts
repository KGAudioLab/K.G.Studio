export const DB_CONSTANTS = {
  // Database constants
  DB_NAME: 'KGStudioDB',
  PROJECTS_STORE_NAME: 'projects',
  CONFIG_STORE_NAME: 'config',
  DB_VERSION: 2, // Incremented to trigger upgrade for existing databases to add config store
};

export const TIME_CONSTANTS = {
  DEFAULT_BPM: 125,
  DEFAULT_TIME_SIGNATURE: {
    numerator: 4,
    denominator: 4,
  },
  MIN_BPM: 1,
  MAX_BPM: 299,
  AVAILABLE_TIME_SIGNATURE_DENOMINATORS: [2, 4, 8, 16],
  AVAILABLE_TIME_SIGNATURE_NUMERATORS: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
};

export const KEY_SIGNATURE_MAP = {
  "C major": { sharps: 0, flats: 0, accidentals: [], relative: "A minor", type: "major", abcNotationKeySignature: "C" },
  "G major": { sharps: 1, flats: 0, accidentals: ["F#"], relative: "E minor", type: "major", abcNotationKeySignature: "G" },
  "D major": { sharps: 2, flats: 0, accidentals: ["F#", "C#"], relative: "B minor", type: "major", abcNotationKeySignature: "D" },
  "A major": { sharps: 3, flats: 0, accidentals: ["F#", "C#", "G#"], relative: "F# minor", type: "major", abcNotationKeySignature: "A" },
  "E major": { sharps: 4, flats: 0, accidentals: ["F#", "C#", "G#", "D#"], relative: "C# minor", type: "major", abcNotationKeySignature: "E" },
  "B major": { sharps: 5, flats: 0, accidentals: ["F#", "C#", "G#", "D#", "A#"], relative: "G# minor", type: "major", abcNotationKeySignature: "B" },
  "F# major": { sharps: 6, flats: 0, accidentals: ["F#", "C#", "G#", "D#", "A#", "E#"], relative: "D# minor", type: "major", abcNotationKeySignature: "F#" },
  "C# major": { sharps: 7, flats: 0, accidentals: ["F#", "C#", "G#", "D#", "A#", "E#", "B#"], relative: "A# minor", type: "major", abcNotationKeySignature: "C#" },
  "F major": { sharps: 0, flats: 1, accidentals: ["Bb"], relative: "D minor", type: "major", abcNotationKeySignature: "F" },
  "Bb major": { sharps: 0, flats: 2, accidentals: ["Bb", "Eb"], relative: "G minor", type: "major", abcNotationKeySignature: "Bb" },
  "Eb major": { sharps: 0, flats: 3, accidentals: ["Bb", "Eb", "Ab"], relative: "C minor", type: "major", abcNotationKeySignature: "Eb" },
  "Ab major": { sharps: 0, flats: 4, accidentals: ["Bb", "Eb", "Ab", "Db"], relative: "F minor", type: "major", abcNotationKeySignature: "Ab" },
  "Db major": { sharps: 0, flats: 5, accidentals: ["Bb", "Eb", "Ab", "Db", "Gb"], relative: "Bb minor", type: "major", abcNotationKeySignature: "Db" },
  "Gb major": { sharps: 0, flats: 6, accidentals: ["Bb", "Eb", "Ab", "Db", "Gb", "Cb"], relative: "Eb minor", type: "major", abcNotationKeySignature: "Gb" },
  "Cb major": { sharps: 0, flats: 7, accidentals: ["Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Fb"], relative: "Ab minor", type: "major", abcNotationKeySignature: "Cb" },

  "A minor": { sharps: 0, flats: 0, accidentals: [], relative: "C major", type: "minor", abcNotationKeySignature: "Am" },
  "E minor": { sharps: 1, flats: 0, accidentals: ["F#"], relative: "G major", type: "minor", abcNotationKeySignature: "Em" },
  "B minor": { sharps: 2, flats: 0, accidentals: ["F#", "C#"], relative: "D major", type: "minor", abcNotationKeySignature: "Bm" },
  "F# minor": { sharps: 3, flats: 0, accidentals: ["F#", "C#", "G#"], relative: "A major", type: "minor", abcNotationKeySignature: "F#m" },
  "C# minor": { sharps: 4, flats: 0, accidentals: ["F#", "C#", "G#", "D#"], relative: "E major", type: "minor", abcNotationKeySignature: "C#m" },
  "G# minor": { sharps: 5, flats: 0, accidentals: ["F#", "C#", "G#", "D#", "A#"], relative: "B major", type: "minor", abcNotationKeySignature: "G#m" },
  "D# minor": { sharps: 6, flats: 0, accidentals: ["F#", "C#", "G#", "D#", "A#", "E#"], relative: "F# major", type: "minor", abcNotationKeySignature: "D#m" },
  "A# minor": { sharps: 7, flats: 0, accidentals: ["F#", "C#", "G#", "D#", "A#", "E#", "B#"], relative: "C# major", type: "minor", abcNotationKeySignature: "A#m" },
  "D minor": { sharps: 0, flats: 1, accidentals: ["Bb"], relative: "F major", type: "minor", abcNotationKeySignature: "Dm" },
  "G minor": { sharps: 0, flats: 2, accidentals: ["Bb", "Eb"], relative: "Bb major", type: "minor", abcNotationKeySignature: "Gm" },
  "C minor": { sharps: 0, flats: 3, accidentals: ["Bb", "Eb", "Ab"], relative: "Eb major", type: "minor", abcNotationKeySignature: "Cm" },
  "F minor": { sharps: 0, flats: 4, accidentals: ["Bb", "Eb", "Ab", "Db"], relative: "Ab major", type: "minor", abcNotationKeySignature: "Fm" },
  "Bb minor": { sharps: 0, flats: 5, accidentals: ["Bb", "Eb", "Ab", "Db", "Gb"], relative: "Db major", type: "minor", abcNotationKeySignature: "Bbm" },
  "Eb minor": { sharps: 0, flats: 6, accidentals: ["Bb", "Eb", "Ab", "Db", "Gb", "Cb"], relative: "Gb major", type: "minor", abcNotationKeySignature: "Ebm" },
  "Ab minor": { sharps: 0, flats: 7, accidentals: ["Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Fb"], relative: "Cb major", type: "minor", abcNotationKeySignature: "Abm" }
} as const;

// Deprecated: Legacy instrument enum kept for backward compatibility in persisted data
// New code should use keys of FLUIDR3_INSTRUMENT_MAP as instrument identifiers
// export const INSTRUMENTS = {
//   PIANO: 'acoustic_grand_piano',
//   GUITAR: 'acoustic_guitar_nylon',
//   BASS: 'electric_bass_finger',
//   DRUMS: 'standard',
// };

export const AUDIO_INTERFACE_CONSTANTS = {
  DEFAULT_MASTER_VOLUME: 0.8,
  DEFAULT_TRACK_VOLUME: 0.8,
};

export const SAMPLER_CONSTANTS = {
  TONE_SAMPLERS: {
    // FLUID: {  // obsolete: missing some instruments
    //   name: 'Fluid Soundfont',
    //   url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/',
    //   instruments: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/names.json',
    //   instrumentMap: new Map<string, string>([
    //     ['PIANO', 'acoustic_grand_piano'],
    //     ['GUITAR', 'acoustic_guitar_nylon'],
    //     ['BASS', 'acoustic_bass'],
    //     ['DRUMS', 'synth_drum'],
    //   ]),
    // }, 
    FLUID: {
      name: 'Fluid Soundfont',
      url: 'https://cdn.jsdelivr.net/npm/soundfont-for-samplers/FluidR3_GM/',
      instruments: 'https://cdn.jsdelivr.net/npm/soundfont-for-samplers/FluidR3_GM/names.json',
      // instrumentRangeMap: new Map<string, number[]>([
      //   ['acoustic_grand_piano', [21, 108]],
      //   ['acoustic_guitar_nylon', [21, 108]],
      //   ['acoustic_bass', [21, 108]],
      //   ['standard', [27, 87]],
      // ]),
    }, 
  }, 
};

export const URL_CONSTANTS = {
  DEFAULT_OPENAI_BASE_URL: 'https://api.openai.com/v1',
};
