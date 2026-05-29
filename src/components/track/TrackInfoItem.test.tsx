import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import TrackInfoItem from './TrackInfoItem';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';

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

vi.mock('../common/KGDropdown', () => ({
  default: () => null,
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
});
