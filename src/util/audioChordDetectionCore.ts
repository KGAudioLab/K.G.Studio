import FFT from 'fft.js';

const FFT_SIZE = 4096;
const HOP_SIZE = 512;
const MIN_ANALYSIS_FREQUENCY = 55;
const MAX_ANALYSIS_FREQUENCY = 1800;
const ABSOLUTE_SILENCE_RMS = 0.0025;
const RELATIVE_SILENCE_RATIO = 0.2;
const MIN_WINDOW_DURATION_SECONDS = 0.08;
const ROOT_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export interface AudioChordWindow {
  barIndex: number;
  startBeat: number;
  endBeat: number;
  startSeconds: number;
  endSeconds: number;
}

export interface AudioChordDetectionRequest {
  pcm: Float32Array;
  sampleRate: number;
  clipStartOffsetSeconds: number;
  windows: AudioChordWindow[];
  options: AudioChordDetectionOptions;
}

export interface DetectedAudioChord {
  barIndex: number;
  startBeat: number;
  endBeat: number;
  symbol: string;
  confidence: number;
  rms: number;
}

export interface AudioChordDetectionProgress {
  completedWindows: number;
  totalWindows: number;
  percent: number;
}

export interface AudioChordDetectionOptions {
  sensitivity: number;
  stability: number;
  noChordThreshold: number;
  enableSevenths: boolean;
}

interface ScoredChord {
  symbol: string;
  score: number;
}

interface TriadCandidate extends ScoredChord {
  root: number;
  quality: 'major' | 'minor';
}

export const DEFAULT_AUDIO_CHORD_DETECTION_OPTIONS: AudioChordDetectionOptions = {
  sensitivity: 50,
  stability: 50,
  noChordThreshold: 0,
  enableSevenths: false,
};

const HANN_WINDOW = (() => {
  const window = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  }
  return window;
})();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseChordSymbol(symbol: string): { rootIndex: number; quality: 'major' | 'minor' | 'other' } | null {
  if (!symbol || symbol === 'N') {
    return null;
  }

  const rootName = symbol.startsWith('C#') || symbol.startsWith('D#') || symbol.startsWith('F#') || symbol.startsWith('G#') || symbol.startsWith('A#')
    ? symbol.slice(0, 2)
    : symbol.slice(0, 1);
  const rootIndex = ROOT_NAMES.indexOf(rootName as typeof ROOT_NAMES[number]);
  if (rootIndex < 0) {
    return null;
  }

  if (symbol === `${rootName}m`) {
    return { rootIndex, quality: 'minor' };
  }

  if (symbol === rootName) {
    return { rootIndex, quality: 'major' };
  }

  return { rootIndex, quality: 'other' };
}

function cloneWindow(window: AudioChordWindow): AudioChordWindow {
  return { ...window };
}

function buildChordCandidates(
  chroma: Float64Array,
  options: AudioChordDetectionOptions,
): { best: ScoredChord; second: ScoredChord } {
  let bestTriad: TriadCandidate = {
    symbol: 'N',
    score: Number.NEGATIVE_INFINITY,
    root: 0,
    quality: 'major',
  };
  let secondTriad: TriadCandidate = {
    symbol: 'N',
    score: Number.NEGATIVE_INFINITY,
    root: 0,
    quality: 'major',
  };

  for (let root = 0; root < ROOT_NAMES.length; root++) {
    const rootEnergy = chroma[root];
    const minorThird = chroma[(root + 3) % 12];
    const majorThird = chroma[(root + 4) % 12];
    const fifth = chroma[(root + 7) % 12];
    const outsideEnergy = Math.max(0, 1 - (rootEnergy + minorThird + majorThird + fifth));

    const majorScore = (rootEnergy * 1.2) + (majorThird * 1.0) + (fifth * 0.8) - (outsideEnergy * 0.35) - (minorThird * 0.5);
    const minorScore = (rootEnergy * 1.2) + (minorThird * 1.0) + (fifth * 0.8) - (outsideEnergy * 0.35) - (majorThird * 0.5);

    const triadCandidates: TriadCandidate[] = [
      { symbol: ROOT_NAMES[root], score: majorScore, root, quality: 'major' },
      { symbol: `${ROOT_NAMES[root]}m`, score: minorScore, root, quality: 'minor' },
    ];

    for (const candidate of triadCandidates) {
      if (candidate.score > bestTriad.score) {
        secondTriad = bestTriad;
        bestTriad = candidate;
      } else if (candidate.score > secondTriad.score) {
        secondTriad = candidate;
      }
    }
  }

  let best: ScoredChord = { symbol: bestTriad.symbol, score: bestTriad.score };
  let second: ScoredChord = { symbol: secondTriad.symbol, score: secondTriad.score };

  if (!options.enableSevenths || bestTriad.symbol === 'N') {
    return { best, second };
  }

  const rootEnergy = chroma[bestTriad.root];
  const minorSeventh = chroma[(bestTriad.root + 10) % 12];
  const majorSeventh = chroma[(bestTriad.root + 11) % 12];
  const seventhCandidates: ScoredChord[] = [];

  if (bestTriad.quality === 'major') {
    const dominantSeventhBonus = Math.max(0, minorSeventh - 0.06) * 2.5;
    const majorSeventhBonus = Math.max(0, majorSeventh - 0.2) * 1.65;

    if (dominantSeventhBonus > 0 && minorSeventh >= rootEnergy * 0.2) {
      seventhCandidates.push({
        symbol: `${ROOT_NAMES[bestTriad.root]}7`,
        score: bestTriad.score + dominantSeventhBonus - (majorSeventh * 0.18) - 0.02,
      });
    }

    if (majorSeventhBonus > 0 && majorSeventh >= rootEnergy * 0.42) {
      seventhCandidates.push({
        symbol: `${ROOT_NAMES[bestTriad.root]}maj7`,
        score: bestTriad.score + majorSeventhBonus - (minorSeventh * 0.2) - 0.04,
      });
    }
  } else {
    const minorSeventhBonus = Math.max(0, minorSeventh - 0.2) * 1.65;
    if (minorSeventhBonus > 0 && minorSeventh >= rootEnergy * 0.42) {
      seventhCandidates.push({
        symbol: `${ROOT_NAMES[bestTriad.root]}m7`,
        score: bestTriad.score + minorSeventhBonus - (majorSeventh * 0.14) - 0.04,
      });
    }
  }

  for (const candidate of seventhCandidates) {
    if (candidate.score > best.score) {
      second = best;
      best = candidate;
    } else if (candidate.score > second.score) {
      second = candidate;
    }
  }

  return { best, second };
}

function analyzeChordWindow(
  pcm: Float32Array,
  sampleRate: number,
  startSeconds: number,
  endSeconds: number,
  options: AudioChordDetectionOptions,
): { symbol: string; confidence: number; rms: number } {
  const startSample = Math.max(0, Math.floor(startSeconds * sampleRate));
  const endSample = Math.min(pcm.length, Math.ceil(endSeconds * sampleRate));
  const sampleCount = Math.max(0, endSample - startSample);

  if (sampleCount === 0 || (endSeconds - startSeconds) < MIN_WINDOW_DURATION_SECONDS) {
    return { symbol: 'N', confidence: 0, rms: 0 };
  }

  const input = new Float32Array(FFT_SIZE);
  const fft = new FFT(FFT_SIZE);
  const output = fft.createComplexArray() as number[];
  const chroma = new Float64Array(12);

  let totalEnergy = 0;
  for (let i = startSample; i < endSample; i++) {
    const value = pcm[i];
    totalEnergy += value * value;
  }
  const rms = Math.sqrt(totalEnergy / sampleCount);

  const totalHops = Math.max(1, Math.floor(Math.max(0, sampleCount - FFT_SIZE) / HOP_SIZE) + 1);
  for (let hop = 0; hop < totalHops; hop++) {
    input.fill(0);
    const frameOffset = startSample + (hop * HOP_SIZE);
    const available = Math.max(0, Math.min(FFT_SIZE, endSample - frameOffset));
    let frameEnergy = 0;

    for (let i = 0; i < available; i++) {
      const weighted = pcm[frameOffset + i] * HANN_WINDOW[i];
      input[i] = weighted;
      frameEnergy += weighted * weighted;
    }

    if (frameEnergy < 1e-7) {
      continue;
    }

    fft.realTransform(output, input as unknown as number[]);
    fft.completeSpectrum(output);

    const earlyFrameWeight = Math.max(0.25, 1.5 - (hop / totalHops));
    for (let bin = 1; bin < FFT_SIZE / 2; bin++) {
      const frequency = (bin * sampleRate) / FFT_SIZE;
      if (frequency < MIN_ANALYSIS_FREQUENCY || frequency > MAX_ANALYSIS_FREQUENCY) {
        continue;
      }

      const real = output[2 * bin];
      const imaginary = output[(2 * bin) + 1];
      const magnitude = Math.sqrt((real * real) + (imaginary * imaginary));
      if (magnitude < 1e-6) {
        continue;
      }

      const midiPitch = 69 + (12 * Math.log2(frequency / 440));
      const roundedPitch = Math.round(midiPitch);
      const pitchClass = ((roundedPitch % 12) + 12) % 12;
      const centsFromPitchClass = Math.abs(midiPitch - roundedPitch);
      const pitchWeight = Math.max(0, 1 - (centsFromPitchClass / 0.5));
      const frequencyWeight = 1 / Math.max(frequency, 80);
      chroma[pitchClass] += magnitude * magnitude * pitchWeight * frequencyWeight * earlyFrameWeight;
    }
  }

  const chromaTotal = chroma.reduce((sum, value) => sum + value, 0);
  if (chromaTotal <= 0) {
    return { symbol: 'N', confidence: 0, rms };
  }

  for (let i = 0; i < chroma.length; i++) {
    chroma[i] /= chromaTotal;
  }

  const { best, second } = buildChordCandidates(chroma, options);
  return {
    symbol: best.symbol,
    confidence: clamp(best.score - second.score + (best.score * 0.2), 0, 1),
    rms,
  };
}

function smoothDetectedChords(
  results: DetectedAudioChord[],
  options: AudioChordDetectionOptions,
): DetectedAudioChord[] {
  if (results.length < 3) {
    return results.map(result => ({ ...result }));
  }

  const smoothed = results.map(result => ({ ...result }));
  const stability = clamp(options.stability, 0, 100);
  const smoothingThreshold = 0.6 + (0.7 * (stability / 100));
  const inheritedConfidenceFloor = 0.45 + (0.6 * (stability / 100));
  for (let i = 1; i < smoothed.length - 1; i++) {
    const previous = smoothed[i - 1];
    const current = smoothed[i];
    const next = smoothed[i + 1];
    if (current.symbol === 'N') {
      continue;
    }
    if (previous.symbol === next.symbol && previous.symbol !== 'N' && current.symbol !== previous.symbol) {
      const surroundingConfidence = Math.max(previous.confidence, next.confidence);
      if (current.confidence < surroundingConfidence * smoothingThreshold) {
        current.symbol = previous.symbol;
        current.confidence = Math.max(current.confidence, surroundingConfidence * inheritedConfidenceFloor);
      }
    }
  }

  return smoothed;
}

function applySeventhContextPromotion(results: DetectedAudioChord[], options: AudioChordDetectionOptions): DetectedAudioChord[] {
  if (!options.enableSevenths || results.length < 2) {
    return results.map(result => ({ ...result }));
  }

  const promoted = results.map(result => ({ ...result }));
  for (let i = 0; i < promoted.length - 1; i++) {
    const current = promoted[i];
    const next = promoted[i + 1];
    const previous = i > 0 ? promoted[i - 1] : null;
    const currentChord = parseChordSymbol(current.symbol);
    const nextChord = parseChordSymbol(next.symbol);
    const previousChord = previous ? parseChordSymbol(previous.symbol) : null;

    if (!currentChord) {
      continue;
    }

    const resolvesToMinorTonic = nextChord
      && currentChord.quality === 'major'
      && nextChord.quality === 'minor'
      && current.confidence >= 0.3
      && ((nextChord.rootIndex - currentChord.rootIndex + 12) % 12) === 5;

    const endsAfterMinorPredominant = next.symbol === 'N'
      && previousChord
      && currentChord.quality === 'major'
      && previousChord.quality === 'minor'
      && current.confidence >= 0.3
      && ((currentChord.rootIndex - previousChord.rootIndex + 12) % 12) === 2;

    if (resolvesToMinorTonic || endsAfterMinorPredominant) {
      current.symbol = `${ROOT_NAMES[currentChord.rootIndex]}7`;
    }
  }

  return promoted;
}

export function detectChordsFromAudio(
  request: AudioChordDetectionRequest,
  onProgress?: (progress: AudioChordDetectionProgress) => void,
): DetectedAudioChord[] {
  const windows = request.windows.map(cloneWindow);
  if (windows.length === 0) {
    return [];
  }
  const options: AudioChordDetectionOptions = {
    ...DEFAULT_AUDIO_CHORD_DETECTION_OPTIONS,
    ...request.options,
  };

  onProgress?.({
    completedWindows: 0,
    totalWindows: windows.length,
    percent: 0,
  });

  const rawResults: DetectedAudioChord[] = [];
  windows.forEach((window, index) => {
    const analysis = analyzeChordWindow(
      request.pcm,
      request.sampleRate,
      request.clipStartOffsetSeconds + (window.startSeconds - request.clipStartOffsetSeconds),
      request.clipStartOffsetSeconds + (window.endSeconds - request.clipStartOffsetSeconds),
      options,
    );

    rawResults.push({
      barIndex: window.barIndex,
      startBeat: window.startBeat,
      endBeat: window.endBeat,
      symbol: analysis.symbol,
      confidence: analysis.confidence,
      rms: analysis.rms,
    });

    onProgress?.({
      completedWindows: index + 1,
      totalWindows: windows.length,
      percent: Math.round(((index + 1) / windows.length) * 100),
    });
  });

  const maxRms = rawResults.reduce((max, result) => Math.max(max, result.rms), 0);
  const sensitivityRatio = clamp((options.sensitivity - 50) / 50, -1, 1);
  const sensitivityFactor = Math.pow(2, -sensitivityRatio);
  const silenceThreshold = Math.max(
    ABSOLUTE_SILENCE_RMS * sensitivityFactor,
    maxRms * RELATIVE_SILENCE_RATIO * sensitivityFactor,
  );
  const noChordThreshold = clamp(options.noChordThreshold, 0, 100) / 100;
  const filtered = rawResults.map(result => (
    result.rms < silenceThreshold || result.confidence < noChordThreshold
      ? { ...result, symbol: 'N', confidence: 0 }
      : result
  ));

  return applySeventhContextPromotion(smoothDetectedChords(filtered, options), options);
}
