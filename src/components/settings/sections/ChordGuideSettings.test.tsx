import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChordGuideSettings from './ChordGuideSettings';

const configState = new Map<string, unknown>([
  ['chord_guide.chord_definition', ''],
]);

const configManagerMock = {
  getIsInitialized: vi.fn(() => true),
  initialize: vi.fn().mockResolvedValue(undefined),
  get: vi.fn((key: string) => configState.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    configState.set(key, value);
  }),
};

vi.mock('../../../core/config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => configManagerMock,
  },
}));

vi.mock('../../../util/scaleUtil', async () => {
  const actual = await vi.importActual<typeof import('../../../util/scaleUtil')>('../../../util/scaleUtil');
  return {
    ...actual,
    validateFunctionalChordsJSON: vi.fn(() => ({ valid: true, errors: [] })),
  };
});

vi.mock('../../../util/dialogUtil', () => ({
  showAlert: vi.fn(),
}));

vi.mock('../../../core/KGCore', () => ({
  KGCore: {
    ORIGINAL_FUNCTIONAL_CHORDS_DATA: {},
    FUNCTIONAL_CHORDS_DATA: {},
  },
}));

describe('ChordGuideSettings', () => {
  beforeEach(() => {
    configState.set('chord_guide.chord_definition', '');
    configManagerMock.get.mockClear();
    configManagerMock.set.mockClear();
  });

  it('renders the legacy notice for chord guide definitions', async () => {
    render(<ChordGuideSettings />);

    expect(await screen.findByText('Legacy Chord Definition')).toBeTruthy();
    expect(
      screen.getByText(/no longer affects chord-guide suggestions in the piano roll/i)
    ).toBeTruthy();
  });
});
