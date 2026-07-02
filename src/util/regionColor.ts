import {
  DEFAULT_AUDIO_REGION_COLOR,
  DEFAULT_MIDI_REGION_COLOR,
} from '../constants/regionColorPalette';

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeHex(color: string): string {
  const trimmed = color.trim();
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (hex.length === 3) {
    return `#${hex.split('').map(channel => channel + channel).join('').toUpperCase()}`;
  }
  return `#${hex.toUpperCase()}`;
}

function parseHexColor(color: string): [number, number, number] | null {
  const normalized = normalizeHex(color);
  if (!/^#[0-9A-F]{6}$/.test(normalized)) {
    return null;
  }

  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
  ];
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map(channel => clampChannel(channel).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function mixColor(color: string, target: [number, number, number], amount: number): string {
  const rgb = parseHexColor(color);
  if (!rgb) {
    return color;
  }

  return rgbToHex(
    rgb[0] + (target[0] - rgb[0]) * amount,
    rgb[1] + (target[1] - rgb[1]) * amount,
    rgb[2] + (target[2] - rgb[2]) * amount,
  );
}

export function normalizeRegionColor(color: string | undefined): string | undefined {
  if (!color) {
    return undefined;
  }

  const normalized = normalizeHex(color);
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : undefined;
}

export function resolveRegionColor(
  regionColor: string | undefined,
  trackColor: string | undefined,
  isAudioRegion: boolean,
): string {
  return normalizeRegionColor(regionColor)
    ?? normalizeRegionColor(trackColor)
    ?? (isAudioRegion ? DEFAULT_AUDIO_REGION_COLOR : DEFAULT_MIDI_REGION_COLOR);
}

export function darkenRegionColor(color: string, amount: number): string {
  return mixColor(color, [0, 0, 0], amount);
}

export function lightenRegionColor(color: string, amount: number): string {
  return mixColor(color, [255, 255, 255], amount);
}

export function buildRegionSurfaceColors(color: string) {
  return {
    borderColor: darkenRegionColor(color, 0.35),
    headerColor: darkenRegionColor(color, 0.2),
    headerHoverColor: darkenRegionColor(color, 0.1),
    contentColor: lightenRegionColor(color, 0.06),
  };
}
