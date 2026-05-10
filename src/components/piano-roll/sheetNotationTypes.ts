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
  startBeat: number;
  endBeat: number;
  isRest: boolean;
  tieStart: boolean;
  tieEnd: boolean;
}

export interface SheetMeasureModel {
  barIndex: number;
  startBeat: number;
  endBeat: number;
  events: SheetDisplayEvent[];
}
