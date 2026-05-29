import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChordGuideSettings from './ChordGuideSettings';
import chordGuideDataJson from '../../../../public/resources/modes/chord_guide.json';
import type { ChordGuideData } from '../../../core/ChordGuideTypes';

const chordGuideData = chordGuideDataJson as ChordGuideData;

const showAlertMock = vi.fn();
const configState = new Map<string, unknown>([
  ['chord_guide.custom_items', null],
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

vi.mock('../../../util/dialogUtil', () => ({
  showAlert: (...args: unknown[]) => showAlertMock(...args),
}));

vi.mock('../../../core/KGCore', () => ({
  KGCore: {
    CHORD_GUIDE_DATA: {
      ionian: { T: [], S: [], D: [] },
      aeolian: { T: [], S: [], D: [] },
    },
  },
}));

describe('ChordGuideSettings', () => {
  const getGroup = (heading: 'Major Candidate Chords' | 'Minor Candidate Chords') => (
    screen.getByText(heading).closest('.settings-group') as HTMLElement
  );

  beforeEach(() => {
    configState.set('chord_guide.custom_items', null);
    configManagerMock.get.mockClear();
    configManagerMock.set.mockClear();
    showAlertMock.mockClear();

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('resources/modes/chord_guide.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => structuredClone(chordGuideData),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));
  });

  it('renders major and minor groups with base-key guidance', async () => {
    render(<ChordGuideSettings />);

    expect(await screen.findByText('Major Candidate Chords')).toBeTruthy();
    expect(screen.getByText('Minor Candidate Chords')).toBeTruthy();
    expect(screen.getByText(/relative to C major/i)).toBeTruthy();
    expect(screen.getByText(/relative to A minor/i)).toBeTruthy();
  });

  it('switches T/S/D tabs as a mutex control', async () => {
    render(<ChordGuideSettings />);

    await screen.findByText('Major Candidate Chords');
    const majorGroup = getGroup('Major Candidate Chords');

    expect(within(majorGroup).getByTitle('C')).toBeTruthy();
    fireEvent.click(within(majorGroup).getByRole('button', { name: 'S' }));

    expect(within(majorGroup).getByTitle('Fmaj7')).toBeTruthy();
    expect(within(majorGroup).queryByTitle('Cmaj7')).toBeNull();
  });

  it('adds and deletes rows in the active table', async () => {
    render(<ChordGuideSettings />);

    await screen.findByText('Major Candidate Chords');
    const addButtons = screen.getAllByTitle(/Add .* chord/);
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(configManagerMock.set).toHaveBeenCalledWith(
        'chord_guide.custom_items',
        expect.objectContaining({
          major: expect.objectContaining({
            T: expect.arrayContaining([expect.objectContaining({ name: 'C' })]),
          }),
        })
      );
    });

    const rows = screen.getAllByRole('row');
    fireEvent.click(rows[1]);
    const deleteButtons = screen.getAllByTitle('Delete selected rows');
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(configManagerMock.set).toHaveBeenCalledTimes(2);
    });
  });

  it('updates notes and source after a valid chord edit', async () => {
    render(<ChordGuideSettings />);

    await screen.findByText('Major Candidate Chords');
    const majorGroup = getGroup('Major Candidate Chords');
    fireEvent.click(within(majorGroup).getByRole('button', { name: 'S' }));

    const chordCell = within(majorGroup).getByTitle('F');
    fireEvent.doubleClick(chordCell);
    const input = screen.getByDisplayValue('F');
    fireEvent.change(input, { target: { value: 'D7' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      const saved = configManagerMock.set.mock.calls.at(-1)?.[1] as {
        major: { S: Array<{ name: string; notes: string[]; source: string }> };
      };
      expect(saved.major.S[0]).toMatchObject({
        name: 'D7',
        notes: ['D', 'F#', 'A', 'C'],
        source: 'Non-Diatonic',
      });
    });
  });

  it('rejects invalid chord edits', async () => {
    render(<ChordGuideSettings />);

    await screen.findByText('Major Candidate Chords');
    const chordCell = screen.getAllByTitle('C')[0];
    fireEvent.doubleClick(chordCell);
    const input = screen.getByDisplayValue('C');
    fireEvent.change(input, { target: { value: 'invalid' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(showAlertMock).toHaveBeenCalledWith(expect.stringContaining('valid chord symbol'));
    });
  });

  it('enforces the 128-character note limit', async () => {
    render(<ChordGuideSettings />);

    await screen.findByText('Major Candidate Chords');
    const noteCell = screen.getAllByRole('cell').find((cell) => cell.textContent === chordGuideData.ionian.T[0].note) as HTMLElement;
    fireEvent.doubleClick(noteCell);
    const input = screen.getByDisplayValue(chordGuideData.ionian.T[0].note);
    fireEvent.change(input, { target: { value: 'x'.repeat(200) } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      const saved = configManagerMock.set.mock.calls.at(-1)?.[1] as { major: { T: Array<{ note: string }> } };
      expect(saved.major.T[0].note).toHaveLength(128);
    });
  });

  it('resets back to bundled defaults', async () => {
    const customItems = structuredClone(chordGuideData);
    customItems.ionian.T = [{
      name: 'G',
      notes: ['G', 'B', 'D'],
      source: 'Diatonic',
      note: 'custom',
    }];
    configState.set('chord_guide.custom_items', {
      major: {
        T: customItems.ionian.T,
        S: customItems.ionian.S,
        D: customItems.ionian.D,
      },
      minor: {
        T: customItems.aeolian.T,
        S: customItems.aeolian.S,
        D: customItems.aeolian.D,
      },
    });

    render(<ChordGuideSettings />);

    expect((await screen.findAllByTitle('G')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Reset to Default'));

    await waitFor(() => {
      expect(configManagerMock.set).toHaveBeenCalledWith('chord_guide.custom_items', null);
      expect(screen.getAllByTitle('C')[0]).toBeTruthy();
    });
  });
});
