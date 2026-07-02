import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUDIO_REGION_COLOR,
  DEFAULT_MIDI_REGION_COLOR,
} from '../constants/regionColorPalette';
import { buildRegionSurfaceColors, resolveRegionColor } from './regionColor';

describe('regionColor helpers', () => {
  it('prefers the region color over the track color', () => {
    expect(resolveRegionColor('#123456', '#654321', false)).toBe('#123456');
  });

  it('falls back to the track color when the region color is missing', () => {
    expect(resolveRegionColor(undefined, '#654321', false)).toBe('#654321');
  });

  it('falls back to the default type color when no overrides are present', () => {
    expect(resolveRegionColor(undefined, undefined, false)).toBe(DEFAULT_MIDI_REGION_COLOR);
    expect(resolveRegionColor(undefined, undefined, true)).toBe(DEFAULT_AUDIO_REGION_COLOR);
  });

  it('builds distinct surface colors for region chrome', () => {
    const colors = buildRegionSurfaceColors('#4CBEC2');

    expect(colors.borderColor).not.toBe('#4CBEC2');
    expect(colors.headerColor).not.toBe('#4CBEC2');
    expect(colors.contentColor).not.toBe('#4CBEC2');
  });
});
