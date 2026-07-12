import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TrackInfoItem from './TrackInfoItem';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { showAlert, showConfirm } from '../../util/dialogUtil';
import { translate } from '../../i18n/translate';

const storeState = {
  selectedTrackId: null as string | null,
  setSelectedTrack: vi.fn(),
  removeTrack: vi.fn(),
  toggleInstrumentSelectionForTrack: vi.fn(),
  importAudioToTrack: vi.fn(),
  updateTrackProperties: vi.fn(),
  tracks: [] as KGAudioTrack[],
  activeTrackAutomationTrackId: null as string | null,
  activeTrackAutomationType: null as string | null,
  setTrackAutomationView: vi.fn(),
  projectName: 'Demo Project',
  setStatus: vi.fn(),
};

let fileImportModalProps: Record<string, unknown> | null = null;

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: Object.assign(
    (selector?: (state: typeof storeState) => unknown) => (
      selector ? selector(storeState) : storeState
    ),
    {
      getState: () => storeState,
    },
  ),
}));

vi.mock('../../i18n/useI18n', async () => {
  const { translate } = await import('../../i18n/translate');
  return {
    useI18n: () => ({
      t: (key: string, params?: Record<string, string | number>) => translate(key, params, 'zh_cn'),
    }),
  };
});

vi.mock('../common/KGDropdown', () => ({
  default: ({ options, isOpen, onChange }: { options: Array<string | { label: string; value: string }>; isOpen?: boolean; onChange: (value: string) => void }) => (
    isOpen ? (
      <div>
        {options.map((option) => {
          const value = typeof option === 'string' ? option : option.value;
          const label = typeof option === 'string' ? option : option.label;
          return (
            <button key={value} type="button" onClick={() => onChange(value)}>
              {label}
            </button>
          );
        })}
      </div>
    ) : null
  ),
}));

vi.mock('../common/FileImportModal', () => ({
  default: (props: Record<string, unknown>) => {
    fileImportModalProps = props;
    return null;
  },
}));

vi.mock('../../util/dialogUtil', () => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(),
}));

const { convertTrackToMidi, downloadBlob } = vi.hoisted(() => ({
  convertTrackToMidi: vi.fn(() => new Uint8Array([1, 2, 3])),
  downloadBlob: vi.fn(),
}));

vi.mock('../../util/midiUtil', () => ({ convertTrackToMidi }));
vi.mock('../../util/miscUtil', () => ({ downloadBlob }));
vi.mock('../../core/KGCore', () => ({
  KGCore: { instance: () => ({ getCurrentProject: () => ({}) }) },
}));

describe('TrackInfoItem audio import', () => {
  beforeEach(() => {
    fileImportModalProps = null;
    storeState.selectedTrackId = null;
    storeState.setSelectedTrack.mockReset();
    storeState.removeTrack.mockReset();
    storeState.toggleInstrumentSelectionForTrack.mockReset();
    storeState.importAudioToTrack.mockReset();
    storeState.updateTrackProperties.mockReset();
    storeState.setTrackAutomationView.mockReset();
    storeState.setStatus.mockReset();
    convertTrackToMidi.mockClear();
    downloadBlob.mockReset();
    vi.mocked(showAlert).mockReset();
    vi.mocked(showConfirm).mockReset();
  });

  it('advertises m4a support in the track audio import modal', () => {
    const audioTrack = new KGAudioTrack('Audio Track', 1);
    audioTrack.setTrackIndex(0);
    storeState.tracks = [audioTrack];

    render(
      <TrackInfoItem
        track={audioTrack}
        index={0}
        isDragging={false}
        isDragOver={false}
        onTrackNameEdit={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
        onDragEnd={vi.fn()}
      />
    );

    expect(fileImportModalProps?.acceptedTypes).toEqual(['.wav', '.mp3', '.ogg', '.flac', '.aac', '.m4a']);
  });

  it('offers MIDI export for MIDI tracks and downloads the track filename', async () => {
    const midiTrack = new KGMidiTrack('Piano', 1);
    midiTrack.setTrackIndex(0);
    storeState.tracks = [midiTrack] as unknown as KGAudioTrack[];

    render(
      <TrackInfoItem
        track={midiTrack}
        index={0}
        isDragging={false}
        isDragOver={false}
        onTrackNameEdit={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
        onDragEnd={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('button', { name: '导出 MIDI' }));

    await waitFor(() => {
      expect(convertTrackToMidi).toHaveBeenCalledWith({}, midiTrack);
      expect(downloadBlob).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'audio/midi', 'Demo Project - Piano.mid');
    });
  });

  it('does not offer MIDI export for audio tracks', () => {
    const audioTrack = new KGAudioTrack('Audio Track', 1);
    audioTrack.setTrackIndex(0);
    storeState.tracks = [audioTrack];

    render(
      <TrackInfoItem
        track={audioTrack}
        index={0}
        isDragging={false}
        isDragOver={false}
        onTrackNameEdit={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
        onDragEnd={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    expect(screen.queryByRole('button', { name: '导出 MIDI' })).not.toBeInTheDocument();
  });

  it('uses the localized delete-track confirmation message when the track has regions', async () => {
    const audioTrack = new KGAudioTrack('钢琴', 1);
    audioTrack.setTrackIndex(0);
    audioTrack.addRegion(new KGMidiRegion('region-1', '1', 0, 'Verse', 0, 4));
    storeState.tracks = [audioTrack];

    vi.mocked(showConfirm).mockResolvedValue(false);

    render(
      <TrackInfoItem
        track={audioTrack}
        index={0}
        isDragging={false}
        isDragOver={false}
        onTrackNameEdit={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
        onDragEnd={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('button', { name: '删除轨道' }));

    await waitFor(() => {
      expect(showConfirm).toHaveBeenCalledWith(
        translate('track.controls.settings.deleteTrackConfirm', { name: '钢琴' }, 'zh_cn')
      );
    });
    expect(storeState.removeTrack).not.toHaveBeenCalled();
  });

  it('skips the confirmation dialog when the track has no regions', async () => {
    const audioTrack = new KGAudioTrack('Empty Track', 1);
    audioTrack.setTrackIndex(0);
    storeState.tracks = [audioTrack];
    storeState.removeTrack.mockResolvedValue(undefined);

    render(
      <TrackInfoItem
        track={audioTrack}
        index={0}
        isDragging={false}
        isDragOver={false}
        onTrackNameEdit={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
        onDragEnd={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('button', { name: '删除轨道' }));

    await waitFor(() => {
      expect(storeState.removeTrack).toHaveBeenCalledWith(1);
    });
    expect(showConfirm).not.toHaveBeenCalled();
  });

  it('does not delete a non-empty track when the confirmation is cancelled', async () => {
    const audioTrack = new KGAudioTrack('Protected Track', 1);
    audioTrack.setTrackIndex(0);
    audioTrack.addRegion(new KGMidiRegion('region-1', '1', 0, 'Verse', 0, 4));
    storeState.tracks = [audioTrack];
    vi.mocked(showConfirm).mockResolvedValue(false);

    render(
      <TrackInfoItem
        track={audioTrack}
        index={0}
        isDragging={false}
        isDragOver={false}
        onTrackNameEdit={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
        onDragEnd={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('button', { name: '删除轨道' }));

    await waitFor(() => {
      expect(showConfirm).toHaveBeenCalled();
    });
    expect(storeState.removeTrack).not.toHaveBeenCalled();
  });

  it('shows an alert when track deletion fails', async () => {
    const audioTrack = new KGAudioTrack('Broken Track', 1);
    audioTrack.setTrackIndex(0);
    storeState.tracks = [audioTrack];
    storeState.removeTrack.mockRejectedValue(new Error('boom'));

    render(
      <TrackInfoItem
        track={audioTrack}
        index={0}
        isDragging={false}
        isDragOver={false}
        onTrackNameEdit={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
        onDragEnd={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('button', { name: '删除轨道' }));

    await waitFor(() => {
      expect(showAlert).toHaveBeenCalledWith(
        translate('track.controls.settings.deleteTrackError', undefined, 'zh_cn')
      );
    });
  });

  it('shows the track color entry and clears the color override', async () => {
    const audioTrack = new KGAudioTrack('Audio Track', 1);
    audioTrack.setTrackIndex(0);
    audioTrack.setColor('#3C8AC4');
    storeState.tracks = [audioTrack];
    storeState.updateTrackProperties.mockResolvedValue(undefined);

    render(
      <TrackInfoItem
        track={audioTrack}
        index={0}
        isDragging={false}
        isDragOver={false}
        onTrackNameEdit={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
        onDragEnd={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('button', { name: '轨道颜色...' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset color' }));

    expect(storeState.updateTrackProperties).toHaveBeenCalledWith(1, { color: null });
  });
});

describe('TrackInfoItem mute and solo controls', () => {
  beforeEach(() => {
    storeState.updateTrackProperties.mockReset();
  });

  it('dims mute when solo overrides it', () => {
    const midiTrack = new KGMidiTrack('Piano', 1);
    midiTrack.setMuted(true);
    midiTrack.setSolo(true);
    storeState.tracks = [midiTrack] as unknown as KGAudioTrack[];

    render(
      <TrackInfoItem
        track={midiTrack}
        index={0}
        isDragging={false}
        isDragOver={false}
        onTrackNameEdit={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
        onDragEnd={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'M' })).toHaveClass('solo-overrides-mute');
  });
});
