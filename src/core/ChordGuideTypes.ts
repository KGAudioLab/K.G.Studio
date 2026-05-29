export type ChordGuideSource = 'Diatonic' | 'Non-Diatonic';

export interface ChordGuideItem {
  name: string;
  roman?: string;
  notes: string[];
  source: ChordGuideSource;
  note: string;
}

export interface ChordGuideModeDefinition {
  T: ChordGuideItem[];
  S: ChordGuideItem[];
  D: ChordGuideItem[];
}

export interface ChordGuideData {
  ionian: ChordGuideModeDefinition;
  aeolian: ChordGuideModeDefinition;
}

export interface ResolvedChordGuideItem extends ChordGuideItem {
  resolvedNotes: string[];
  pitchClasses: number[];
}

export type ChordGuideGroupKey = 'major' | 'minor';

export interface ChordGuideCustomConfig {
  major: ChordGuideModeDefinition;
  minor: ChordGuideModeDefinition;
}
