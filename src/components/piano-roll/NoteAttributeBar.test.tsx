import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import NoteAttributeBar from './NoteAttributeBar';
import { KGMidiNote } from '../../core/midi/KGMidiNote';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';

const mocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  updateTrack: vi.fn(),
  commandConstructor: vi.fn(),
}));

vi.mock('../../core/KGCore', () => ({
  KGCore: {
    instance: () => ({ executeCommand: mocks.executeCommand }),
  },
}));

vi.mock('../../core/commands/note/UpdateNotePropertiesCommand', () => ({
  UpdateNotePropertiesCommand: class {
    constructor(...args: unknown[]) {
      mocks.commandConstructor(...args);
    }
  },
}));

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: () => ({
    tracks: [{ getId: () => 'track-1' }],
    updateTrack: mocks.updateTrack,
  }),
}));

function createNote(id: string, velocity: number): KGMidiNote {
  return new KGMidiNote(id, 0, 1, 60, velocity);
}

function renderBar(notes: KGMidiNote[]) {
  const region = new KGMidiRegion('region-1', 'track-1', 0, 'Region', 0, 4);
  region.setNotes(notes);
  render(<NoteAttributeBar selectedNotes={notes} isSpectrogram={false} activeRegion={region} />);
  return region;
}

function openVelocityEditor(buttonName: string) {
  fireEvent.click(screen.getByRole('button', { name: buttonName }));
  return {
    input: screen.getByRole('textbox', { name: 'Velocity' }) as HTMLInputElement,
    slider: screen.getByRole('slider') as HTMLInputElement,
  };
}

describe('NoteAttributeBar velocity editor', () => {
  beforeEach(() => {
    mocks.executeCommand.mockClear();
    mocks.updateTrack.mockClear();
    mocks.commandConstructor.mockClear();
  });

  it('previews typed values and commits them as one command on Enter', () => {
    const note = createNote('note-1', 80);
    renderBar([note]);

    const { input, slider } = openVelocityEditor('80');
    expect(input).toHaveFocus();
    expect(input.value).toBe('80');

    fireEvent.change(input, { target: { value: '100' } });

    expect(note.getVelocity()).toBe(100);
    expect(slider.value).toBe('100');

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mocks.executeCommand).toHaveBeenCalledTimes(1);
    expect(mocks.commandConstructor).toHaveBeenCalledWith(
      'region-1',
      [expect.objectContaining({ noteId: 'note-1', velocity: 80 })],
      [{ noteId: 'note-1', velocity: 100 }]
    );
    expect(screen.queryByRole('textbox', { name: 'Velocity' })).not.toBeInTheDocument();
  });

  it('synchronizes slider changes to the input and commits on outside click', () => {
    const note = createNote('note-1', 64);
    renderBar([note]);

    const { input, slider } = openVelocityEditor('64');
    fireEvent.change(slider, { target: { value: '127' } });

    expect(input.value).toBe('127');
    expect(note.getVelocity()).toBe(127);

    fireEvent.mouseDown(document.body);

    expect(mocks.executeCommand).toHaveBeenCalledTimes(1);
    expect(mocks.commandConstructor.mock.calls[0][2]).toEqual([{ noteId: 'note-1', velocity: 127 }]);
  });

  it('restores original velocities and does not commit on Escape', () => {
    const note = createNote('note-1', 72);
    renderBar([note]);

    const { input } = openVelocityEditor('72');
    fireEvent.change(input, { target: { value: '95' } });
    expect(note.getVelocity()).toBe(95);

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(note.getVelocity()).toBe(72);
    expect(mocks.executeCommand).not.toHaveBeenCalled();
  });

  it('shows a mixed placeholder without changing notes until the user edits', () => {
    const notes = [createNote('note-1', 70), createNote('note-2', 90)];
    renderBar(notes);

    const { input, slider } = openVelocityEditor('--');
    expect(input.value).toBe('');
    expect(input.placeholder).toBe('--');
    expect(slider.value).toBe('64');

    fireEvent.mouseDown(document.body);

    expect(notes.map(note => note.getVelocity())).toEqual([70, 90]);
    expect(mocks.executeCommand).not.toHaveBeenCalled();
  });

  it('applies the first slider change uniformly to mixed notes', () => {
    const notes = [createNote('note-1', 70), createNote('note-2', 90)];
    renderBar(notes);

    const { input, slider } = openVelocityEditor('--');
    fireEvent.change(slider, { target: { value: '110' } });

    expect(input.value).toBe('110');
    expect(notes.map(note => note.getVelocity())).toEqual([110, 110]);
  });

  it('ignores invalid text and leaves notes unchanged when no valid edit exists', () => {
    const note = createNote('note-1', 80);
    renderBar([note]);

    const { input, slider } = openVelocityEditor('80');
    for (const invalidValue of ['', '12.5', 'abc', '-1', '128']) {
      fireEvent.change(input, { target: { value: invalidValue } });
      expect(note.getVelocity()).toBe(80);
      expect(slider.value).toBe('80');
    }

    fireEvent.mouseDown(document.body);
    expect(mocks.executeCommand).not.toHaveBeenCalled();
  });

  it('commits the last valid preview when the input later becomes invalid', () => {
    const note = createNote('note-1', 80);
    renderBar([note]);

    const { input } = openVelocityEditor('80');
    fireEvent.change(input, { target: { value: '96' } });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.mouseDown(document.body);

    expect(mocks.commandConstructor.mock.calls[0][2]).toEqual([{ noteId: 'note-1', velocity: 96 }]);
    expect(mocks.executeCommand).toHaveBeenCalledTimes(1);
  });

  it('adjusts the input by one with the arrow keys and clamps at MIDI bounds', () => {
    const note = createNote('note-1', 127);
    renderBar([note]);

    const { input } = openVelocityEditor('127');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('127');
    expect(note.getVelocity()).toBe(127);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.value).toBe('126');
    expect(note.getVelocity()).toBe(126);
  });
});
