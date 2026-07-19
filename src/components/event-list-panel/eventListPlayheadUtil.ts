export interface EventListRowMeasurement {
  beat: number;
  top: number;
  bottom: number;
}

export interface EventListPlayheadAnchor {
  beat: number;
  y: number;
}

export const normalizeEventListPlayheadBeat = (beat: number, ticksPerBeat: number): number => (
  Math.round(beat * ticksPerBeat) / ticksPerBeat
);

export const buildEventListPlayheadAnchors = (
  rows: EventListRowMeasurement[],
  songEndBeat: number,
  bodyTop: number,
): EventListPlayheadAnchor[] => {
  if (rows.length === 0 || !Number.isFinite(songEndBeat) || songEndBeat <= 0) {
    return [];
  }

  const anchors: EventListPlayheadAnchor[] = [{ beat: 0, y: bodyTop }];

  for (let index = 0; index < rows.length;) {
    const firstRow = rows[index];
    let lastIndex = index;

    while (lastIndex + 1 < rows.length && rows[lastIndex + 1].beat === firstRow.beat) {
      lastIndex += 1;
    }

    if (firstRow.beat > 0 && firstRow.beat < songEndBeat) {
      anchors.push({
        beat: firstRow.beat,
        y: firstRow.top,
      });
    }

    index = lastIndex + 1;
  }

  anchors.push({ beat: songEndBeat, y: rows[rows.length - 1].bottom });
  return anchors;
};

export const interpolateEventListPlayheadY = (
  playheadBeat: number,
  anchors: EventListPlayheadAnchor[],
): number | null => {
  if (anchors.length < 2 || !Number.isFinite(playheadBeat)) return null;

  const clampedBeat = Math.max(anchors[0].beat, Math.min(playheadBeat, anchors[anchors.length - 1].beat));

  for (let index = 1; index < anchors.length; index += 1) {
    const next = anchors[index];
    if (clampedBeat > next.beat) continue;

    const previous = anchors[index - 1];
    const beatSpan = next.beat - previous.beat;
    if (beatSpan <= 0) return next.y;

    const progress = (clampedBeat - previous.beat) / beatSpan;
    return previous.y + (next.y - previous.y) * progress;
  }

  return anchors[anchors.length - 1].y;
};
