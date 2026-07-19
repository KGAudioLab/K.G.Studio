import type { KeySignature } from '../../core/KGProject';

export interface SheetMeasureMetric {
  barIndex: number;
  startBeat: number;
  endBeat: number;
  leftPx: number;
  widthPx: number;
}

export interface SheetQuantization {
  raw: string;
  primary: number;
  subdivision: number;
  stepBeats: number;
}

export interface SheetDisplayEvent {
  keys: string[];
  midiPitches: number[];
  startBeat: number;
  endBeat: number;
  isRest: boolean;
  tieStart: boolean;
  tieEnd: boolean;
}

export interface SheetMeasureModel {
  barIndex: number;
  absoluteBarIndex: number;
  startBeat: number;
  endBeat: number;
  keySignature: KeySignature;
  events: SheetDisplayEvent[];
}
