import type { KeySignature } from '../../core/KGProject';

export interface SheetMeasureMetric {
  barIndex: number;
  startTick: number;
  endTick: number;
  leftPx: number;
  widthPx: number;
}

export interface SheetQuantization {
  raw: string;
  primary: number;
  subdivision: number;
  stepTicks: number;
}

export interface SheetDisplayEvent {
  keys: string[];
  midiPitches: number[];
  startTick: number;
  endTick: number;
  isRest: boolean;
  tieStart: boolean;
  tieEnd: boolean;
}

export interface SheetMeasureModel {
  barIndex: number;
  absoluteBarIndex: number;
  startTick: number;
  endTick: number;
  keySignature: KeySignature;
  events: SheetDisplayEvent[];
}
