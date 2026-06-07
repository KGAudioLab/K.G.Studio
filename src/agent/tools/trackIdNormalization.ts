export function normalizeOptionalTrackIdParam(params: Record<string, unknown>): Record<string, unknown> {
  const rawTrackId = params.track_id;

  if (rawTrackId === undefined || rawTrackId === null || typeof rawTrackId === 'string') {
    return params;
  }

  if (typeof rawTrackId === 'number' && Number.isFinite(rawTrackId) && Number.isInteger(rawTrackId)) {
    return {
      ...params,
      track_id: String(rawTrackId),
    };
  }

  return params;
}
