import { Chord, Interval, Note } from 'tonal';

export type ChordQuality = 'maj' | 'min' | 'sus2' | 'sus4' | 'power' | 'aug' | 'dim';
export type ChordExtension =
  | 'b5'
  | '#5'
  | '6'
  | '7'
  | 'dim7'
  | 'maj7'
  | 'b9'
  | '9'
  | '#9'
  | '11'
  | '#11'
  | 'b13'
  | '13';

export interface ChordDescriptor {
  root: string;
  quality: ChordQuality;
  extensions: ChordExtension[];
  symbol: string;
}

const ROOT_PATTERN = /^[A-G](?:#|b)?$/;
const EXTENSION_ORDER: ChordExtension[] = ['b5', '#5', '6', '7', 'dim7', 'maj7', 'b9', '9', '#9', '11', '#11', 'b13', '13'];
const REMAINING_EXTENSION_ORDER: ChordExtension[] = ['b5', '#5', 'b9', '9', '#9', '11', '#11', 'b13', '13'];
const ADD_EXTENSION_ORDER: ChordExtension[] = ['b9', '9', '#9', '11', '#11', 'b13', '13'];
const CUSTOM_TOKENS = [
  'maj7#5',
  'm7b5',
  'dim7',
  'sus2',
  'sus4',
  'aug',
  'dim',
  'maj7',
  'add#11',
  'addb13',
  'add13',
  'add11',
  'add#9',
  'addb9',
  'add9',
  '#11',
  'b13',
  '#9',
  'b9',
  '9',
  '13',
  '11',
  '#5',
  'b5',
  '7',
  '6',
  'm',
  '5',
] as const;

function normalizeRoot(root: string): string | null {
  const normalized = root.trim();
  if (!ROOT_PATTERN.test(normalized)) {
    return null;
  }

  const parsed = Note.get(normalized);
  return parsed.empty || parsed.acc.length > 1 ? null : parsed.pc;
}

function sortExtensions(extensions: Iterable<ChordExtension>): ChordExtension[] {
  const unique = new Set(extensions);
  return EXTENSION_ORDER.filter(extension => unique.has(extension));
}

function hasExtension(descriptor: Pick<ChordDescriptor, 'extensions'>, extension: ChordExtension): boolean {
  return descriptor.extensions.includes(extension);
}

interface CollapsedNaturalExtension {
  suffix: string;
  consumed: ChordExtension[];
}

function getCollapsedNaturalExtension(
  quality: ChordQuality,
  extensions: ChordExtension[],
): CollapsedNaturalExtension | null {
  const has = (extension: ChordExtension) => extensions.includes(extension);
  const consume = (...consumed: ChordExtension[]): ChordExtension[] => consumed.filter(has);

  if (quality === 'maj' && has('maj7')) {
    if (has('13')) {
      return { suffix: 'maj13', consumed: consume('maj7', '9', '11', '13') };
    }
    if (has('11')) {
      return { suffix: 'maj11', consumed: consume('maj7', '9', '11') };
    }
    if (has('9')) {
      return { suffix: 'maj9', consumed: consume('maj7', '9') };
    }
  }

  if (quality === 'maj' && has('7')) {
    if (has('13')) {
      return { suffix: '13', consumed: consume('7', '9', '11', '13') };
    }
    if (has('11')) {
      return { suffix: '11', consumed: consume('7', '9', '11') };
    }
    if (has('9')) {
      return { suffix: '9', consumed: consume('7', '9') };
    }
  }

  if (quality === 'min' && has('7')) {
    if (has('13')) {
      return { suffix: 'm13', consumed: consume('7', '9', '11', '13') };
    }
    if (has('11')) {
      return { suffix: 'm11', consumed: consume('7', '9', '11') };
    }
    if (has('9')) {
      return { suffix: 'm9', consumed: consume('7', '9') };
    }
  }

  return null;
}

function getDescriptorIntervals(descriptor: Pick<ChordDescriptor, 'quality' | 'extensions'>): string[] {
  const intervals = ['1P'];

  switch (descriptor.quality) {
    case 'maj':
      intervals.push('3M', '5P');
      break;
    case 'min':
      intervals.push('3m', '5P');
      break;
    case 'sus2':
      intervals.push('2M', '5P');
      break;
    case 'sus4':
      intervals.push('4P', '5P');
      break;
    case 'power':
      intervals.push('5P');
      break;
    case 'aug':
      intervals.push('3M', '5A');
      break;
    case 'dim':
      intervals.push('3m', '5d');
      break;
  }

  for (const extension of descriptor.extensions) {
    switch (extension) {
      case 'b5':
        if (!intervals.includes('5d')) {
          intervals.push('5d');
        }
        break;
      case '#5':
        if (!intervals.includes('5A')) {
          intervals.push('5A');
        }
        break;
      case '6':
        intervals.push('6M');
        break;
      case '7':
        intervals.push('7m');
        break;
      case 'dim7':
        intervals.push('7d');
        break;
      case 'maj7':
        intervals.push('7M');
        break;
      case 'b9':
        intervals.push('9m');
        break;
      case '9':
        intervals.push('9M');
        break;
      case '#9':
        intervals.push('9A');
        break;
      case '11':
        intervals.push('11P');
        break;
      case '#11':
        intervals.push('11A');
        break;
      case 'b13':
        intervals.push('13m');
        break;
      case '13':
        intervals.push('13M');
        break;
    }
  }

  return Array.from(new Set(intervals));
}

function parseIntervalsToDescriptor(root: string, intervals: string[]): ChordDescriptor | null {
  const intervalSet = new Set(intervals);
  let quality: ChordQuality | null = null;

  if (intervalSet.has('5A')) {
    quality = 'aug';
  } else if (intervalSet.has('2M') && !intervalSet.has('3m') && !intervalSet.has('3M') && !intervalSet.has('4P') && intervalSet.has('5P')) {
    quality = 'sus2';
  } else if (intervalSet.has('4P') && !intervalSet.has('3m') && !intervalSet.has('3M') && intervalSet.has('5P')) {
    quality = 'sus4';
  } else if (intervalSet.has('3m') && intervalSet.has('5d')) {
    quality = 'dim';
  } else if (intervalSet.has('3m')) {
    quality = 'min';
  } else if (intervalSet.has('3M')) {
    quality = 'maj';
  } else if (intervalSet.has('5P')) {
    quality = 'power';
  }

  if (!quality) {
    return null;
  }

  if (intervalSet.has('3A') || intervalSet.has('4d')) {
    return null;
  }

  const extensions = new Set<ChordExtension>();
  if (intervalSet.has('5d')) {
    extensions.add('b5');
  }
  if (intervalSet.has('5A')) {
    extensions.add('#5');
  }
  if (intervalSet.has('6M')) {
    extensions.add('6');
  }
  if (intervalSet.has('7m')) {
    extensions.add('7');
  }
  if (intervalSet.has('7d')) {
    extensions.add('dim7');
  }
  if (intervalSet.has('7M')) {
    extensions.add('maj7');
  }
  if (intervalSet.has('9m') || intervalSet.has('2m')) {
    extensions.add('b9');
  }
  if (intervalSet.has('9M') || (intervalSet.has('2M') && quality !== 'sus2')) {
    extensions.add('9');
  }
  if (intervalSet.has('9A')) {
    extensions.add('#9');
  }
  if (intervalSet.has('11P') && quality !== 'sus4') {
    extensions.add('11');
  }
  if (intervalSet.has('11A')) {
    extensions.add('#11');
  }
  if (intervalSet.has('13m') || intervalSet.has('6m')) {
    extensions.add('b13');
  }
  if (intervalSet.has('13M')) {
    extensions.add('13');
  }

  const descriptor: ChordDescriptor = {
    root,
    quality,
    extensions: sortExtensions(extensions),
    symbol: '',
  };

  const symbol = buildChordSymbol(descriptor);
  if (!symbol) {
    return null;
  }

  return {
    ...descriptor,
    symbol,
  };
}

function parseCustomChordSymbol(symbol: string): ChordDescriptor | null {
  const trimmed = symbol.trim();
  const rootMatch = trimmed.match(/^([A-G](?:#|b)?)(.*)$/);
  if (!rootMatch) {
    return null;
  }

  const root = normalizeRoot(rootMatch[1]);
  if (!root) {
    return null;
  }

  let remainder = rootMatch[2];
  let quality: ChordQuality = 'maj';
  const extensions = new Set<ChordExtension>();

  if (remainder.startsWith('m7b5')) {
    quality = 'dim';
    extensions.add('b5');
    extensions.add('7');
    remainder = remainder.slice(4);
  } else if (remainder.startsWith('dim7')) {
    quality = 'dim';
    extensions.add('b5');
    extensions.add('dim7');
    remainder = remainder.slice(4);
  } else if (remainder.startsWith('maj7#5')) {
    quality = 'aug';
    extensions.add('#5');
    extensions.add('maj7');
    remainder = remainder.slice(6);
  } else if (remainder.startsWith('7#5')) {
    quality = 'aug';
    extensions.add('#5');
    extensions.add('7');
    remainder = remainder.slice(3);
  } else if (remainder.startsWith('sus2')) {
    quality = 'sus2';
    remainder = remainder.slice(4);
  } else if (remainder.startsWith('sus4')) {
    quality = 'sus4';
    remainder = remainder.slice(4);
  } else if (remainder.startsWith('aug')) {
    quality = 'aug';
    remainder = remainder.slice(3);
  } else if (remainder.startsWith('dim')) {
    quality = 'dim';
    remainder = remainder.slice(3);
  } else if (remainder.startsWith('m')) {
    quality = 'min';
    remainder = remainder.slice(1);
  } else if (remainder.startsWith('5')) {
    quality = 'power';
    remainder = remainder.slice(1);
  }

  if (remainder.startsWith('maj7')) {
    extensions.add('maj7');
    remainder = remainder.slice(4);
  } else if (remainder.startsWith('7')) {
    extensions.add('7');
    remainder = remainder.slice(1);
  } else if (remainder.startsWith('6')) {
    extensions.add('6');
    remainder = remainder.slice(1);
  }

  while (remainder.length > 0) {
    const nextToken = CUSTOM_TOKENS.find(token => remainder.startsWith(token));
    if (!nextToken) {
      return null;
    }

    switch (nextToken) {
      case 'b5':
        extensions.add('b5');
        break;
      case '#5':
        extensions.add('#5');
        break;
      case 'b9':
      case 'addb9':
        extensions.add('b9');
        break;
      case '9':
      case 'add9':
        extensions.add('9');
        break;
      case '#9':
      case 'add#9':
        extensions.add('#9');
        break;
      case '11':
      case 'add11':
        extensions.add('11');
        break;
      case '#11':
      case 'add#11':
        extensions.add('#11');
        break;
      case 'b13':
      case 'addb13':
        extensions.add('b13');
        break;
      case '13':
      case 'add13':
        extensions.add('13');
        break;
      default:
        return null;
    }

    remainder = remainder.slice(nextToken.length);
  }

  const descriptor: ChordDescriptor = {
    root,
    quality,
    extensions: sortExtensions(extensions),
    symbol: '',
  };

  const canonical = buildChordSymbol(descriptor);
  if (!canonical) {
    return null;
  }

  return {
    ...descriptor,
    symbol: canonical,
  };
}

function tokenizeTonalIntervals(intervals: string[]): string[] | null {
  const normalized = intervals
    .map(interval => interval.replace(/^(\d+)([PmMdA])$/, '$1$2').replace(/^(\d+)([dm])$/, '$1$2'))
    .filter(Boolean);

  if (normalized.length === 0) {
    return null;
  }

  return normalized;
}

export function buildChordSymbol(descriptor: Pick<ChordDescriptor, 'root' | 'quality' | 'extensions'>): string | null {
  const root = normalizeRoot(descriptor.root);
  if (!root) {
    return null;
  }

  const extensions = sortExtensions(descriptor.extensions);
  const has = (extension: ChordExtension) => extensions.includes(extension);
  const hasSeventh = has('7') || has('dim7') || has('maj7');
  const remainingExtensions = new Set(extensions);

  let symbol = root;

  if (descriptor.quality === 'dim' && has('dim7')) {
    symbol += 'dim7';
    remainingExtensions.delete('dim7');
    remainingExtensions.delete('b5');
  } else if (descriptor.quality === 'dim' && has('7')) {
    symbol += 'm7b5';
    remainingExtensions.delete('7');
    remainingExtensions.delete('b5');
  } else if (descriptor.quality === 'aug' && has('7')) {
    symbol += '7#5';
    remainingExtensions.delete('7');
    remainingExtensions.delete('#5');
  } else if (descriptor.quality === 'aug' && has('maj7')) {
    symbol += 'maj7#5';
    remainingExtensions.delete('maj7');
    remainingExtensions.delete('#5');
  } else {
    const collapsedNaturalExtension = getCollapsedNaturalExtension(descriptor.quality, extensions);
    if (collapsedNaturalExtension) {
      symbol += collapsedNaturalExtension.suffix;
      collapsedNaturalExtension.consumed.forEach(extension => remainingExtensions.delete(extension));
    } else {
      switch (descriptor.quality) {
        case 'maj':
          break;
        case 'min':
          symbol += 'm';
          break;
        case 'sus2':
          symbol += 'sus2';
          break;
        case 'sus4':
          symbol += 'sus4';
          break;
        case 'power':
          symbol += '5';
          break;
        case 'aug':
          symbol += 'aug';
          remainingExtensions.delete('#5');
          break;
        case 'dim':
          symbol += 'dim';
          remainingExtensions.delete('b5');
          break;
      }

      if (has('dim7')) {
        symbol += 'dim7';
        remainingExtensions.delete('dim7');
      } else if (has('maj7')) {
        symbol += 'maj7';
        remainingExtensions.delete('maj7');
      } else if (has('7')) {
        symbol += '7';
        remainingExtensions.delete('7');
      } else if (has('6')) {
        symbol += '6';
        remainingExtensions.delete('6');
      }
    }
  }

  for (const extension of REMAINING_EXTENSION_ORDER) {
    if (!remainingExtensions.has(extension)) {
      continue;
    }

    if (ADD_EXTENSION_ORDER.includes(extension) && !hasSeventh) {
      symbol += `add${extension}`;
    } else {
      symbol += extension;
    }
  }

  return symbol;
}

export function parseChordSymbol(symbol: string): ChordDescriptor | null {
  const trimmed = symbol.trim();
  if (!trimmed) {
    return null;
  }

  const tonalChord = Chord.get(trimmed);
  if (tonalChord && !tonalChord.empty && tonalChord.tonic && !tonalChord.bass && !tonalChord.root) {
    const root = normalizeRoot(tonalChord.tonic);
    const intervals = tokenizeTonalIntervals(tonalChord.intervals);
    if (root && intervals) {
      const parsed = parseIntervalsToDescriptor(root, intervals);
      if (parsed) {
        return parsed;
      }
    }
  }

  return parseCustomChordSymbol(trimmed);
}

export function getChordPitchClasses(symbol: string): number[] {
  const descriptor = parseChordSymbol(symbol);
  if (!descriptor) {
    return [];
  }

  const root = Note.get(descriptor.root);
  if (root.empty || root.chroma === undefined) {
    return [];
  }

  return getDescriptorIntervals(descriptor).map((interval) => {
    const semitones = Interval.semitones(interval);
    return (root.chroma + semitones + 120) % 12;
  });
}

export function getChordMidiPitches(symbol: string, rootMidi: number): number[] {
  const descriptor = parseChordSymbol(symbol);
  if (!descriptor) {
    return [];
  }

  return getDescriptorIntervals(descriptor).map((interval) => rootMidi + Interval.semitones(interval));
}

export function formatChordSymbolForDisplay(symbol: string): string {
  const descriptor = parseChordSymbol(symbol);
  if (!descriptor) {
    return symbol;
  }

  const { root, quality, extensions } = descriptor;
  const accidentalDisplay = (value: string) => value.replace(/b/g, '♭').replace(/#/g, '♯');
  if (quality === 'dim' && extensions.includes('dim7')) {
    return `${accidentalDisplay(root)}dim7`;
  }
  const collapsedNaturalExtension = getCollapsedNaturalExtension(quality, extensions);
  const consumedCollapsedExtensions = new Set(collapsedNaturalExtension?.consumed ?? []);
  const baseQuality = (() => {
    if (collapsedNaturalExtension) {
      return '';
    }

    switch (quality) {
      case 'maj':
        return '';
      case 'min':
        return 'm';
      case 'sus2':
        return 'sus2';
      case 'sus4':
        return 'sus4';
      case 'power':
        return '5';
      case 'aug':
        return 'aug';
      case 'dim':
        return extensions.includes('dim7') || !extensions.includes('7') ? 'dim' : 'm';
    }
  })();

  const inlineExtensions: string[] = [];
  const parentheticalExtensions: string[] = [];

  for (const extension of extensions) {
    if (consumedCollapsedExtensions.has(extension)) {
      continue;
    }

    if (quality === 'dim' && extension === 'b5' && !extensions.includes('7')) {
      continue;
    }

    if (extension === '7' || extension === 'dim7' || extension === 'maj7' || extension === '6') {
      inlineExtensions.push(extension);
      continue;
    }

    parentheticalExtensions.push(accidentalDisplay(extension));
  }

  const inlineText = collapsedNaturalExtension
    ? collapsedNaturalExtension.suffix
    : inlineExtensions.join('');
  const parentheticalText = parentheticalExtensions.length > 0
    ? `(${parentheticalExtensions.join(', ')})`
    : '';

  return `${accidentalDisplay(root)}${baseQuality}${inlineText}${parentheticalText}`;
}

export const CHORD_QUALITY_OPTIONS: ChordQuality[] = ['maj', 'min', 'sus2', 'sus4', 'power', 'aug', 'dim'];
export const CHORD_EXTENSION_OPTIONS: ChordExtension[] = EXTENSION_ORDER;
