import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import TrackInfoItem from './TrackInfoItem';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';
import { showConfirm } from '../../util/dialogUtil';
import { translate } from '../../i18n/translate';

const storeState = {
  selectedTrackId: null as string | null,
  setSelectedTrack: vi.fn(),
  removeTrack: vi.fn(),
  toggleInstrumentSelectionForTrack: vi.fn(),
  importAudioToTrack: vi.fn(),
  tracks: [] as KGAudioTrack[],
  activeTrackAutomationTrackId: null as string | null,
  activeTrackAutomationType: null as string | null,
  setTrackAutomationView: vi.fn(),
};

let fileImportModalProps: Record<string, unknown> | null = null;

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: (selector?: (state: typeof storeState) => unknown) => (
    selector ? selector(storeState) : storeState
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

describe('TrackInfoItem audio import', () => {
  beforeEach(() => {
    fileImportModalProps = null;
    storeState.selectedTrackId = null;
    storeState.setSelectedTrack.mockReset();
    storeState.removeTrack.mockReset();
    storeState.toggleInstrumentSelectionForTrack.mockReset();
    storeState.importAudioToTrack.mockReset();
    storeState.setTrackAutomationView.mockReset();
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

  it('uses the localized delete-track confirmation message', () => {
    const audioTrack = new KGAudioTrack('钢琴', 1);
    audioTrack.setTrackIndex(0);
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

    expect(showConfirm).toHaveBeenCalledWith(
      translate('track.controls.settings.deleteTrackConfirm', { name: '钢琴' }, 'zh_cn')
    );
  });
});
