export interface EventListRowMeasurement {
  tick: number;
  top: number;
  bottom: number;
}

export interface EventListPlayheadAnchor {
  tick: number;
  y: number;
}

export const normalizeEventListPlayheadTick = (tick: number, ticksPerQuarter: number): number => (
  Math.round(tick * ticksPerQuarter) / ticksPerQuarter
);

export const buildEventListPlayheadAnchors = (
  rows: EventListRowMeasurement[],
  songEndTick: number,
  bodyTop: number,
): EventListPlayheadAnchor[] => {
  if (rows.length === 0 || !Number.isFinite(songEndTick) || songEndTick <= 0) {
    return [];
  }

  const anchors: EventListPlayheadAnchor[] = [{ tick: 0, y: bodyTop }];

  for (let index = 0; index < rows.length;) {
    const firstRow = rows[index];
    let lastIndex = index;

    while (lastIndex + 1 < rows.length && rows[lastIndex + 1].tick === firstRow.tick) {
      lastIndex += 1;
    }

    if (firstRow.tick > 0 && firstRow.tick < songEndTick) {
      anchors.push({
        tick: firstRow.tick,
        y: firstRow.top,
      });
    }

    index = lastIndex + 1;
  }

  anchors.push({ tick: songEndTick, y: rows[rows.length - 1].bottom });
  return anchors;
};

export const interpolateEventListPlayheadY = (
  playheadTick: number,
  anchors: EventListPlayheadAnchor[],
): number | null => {
  if (anchors.length < 2 || !Number.isFinite(playheadTick)) return null;

  const clampedTick = Math.max(anchors[0].tick, Math.min(playheadTick, anchors[anchors.length - 1].tick));

  for (let index = 1; index < anchors.length; index += 1) {
    const next = anchors[index];
    if (clampedTick > next.tick) continue;

    const previous = anchors[index - 1];
    const tickSpan = next.tick - previous.tick;
    if (tickSpan <= 0) return next.y;

    const progress = (clampedTick - previous.tick) / tickSpan;
    return previous.y + (next.y - previous.y) * progress;
  }

  return anchors[anchors.length - 1].y;
};
