export interface ChordGuideItem {
  name: string;
  roman: string;
  notes: string[];
  source: string;
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
