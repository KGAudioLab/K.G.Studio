import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import TrackGridItem from './TrackGridItem';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: (selector?: (state: {
    selectedRegionIds: string[];
    activeTrackAutomationTrackId: string | null;
    activeTrackAutomationType: null;
    trackAutomationRedrawVersion: number;
    recordingMode: 'audio' | 'midi' | null;
    recordingTargetTrackIndex: number | null;
    recordingCommitStartBeatAbsolute: number;
    recordingAudioPreviewCurrentBeat: number;
    recordingAudioPreviewPeaks: Array<{ min: number; max: number }>;
    recordingAudioPreviewFileName: string | null;
    timeSignature: { numerator: number; denominator: number };
  }) => unknown) => {
    const state = {
      selectedRegionIds: [],
      activeTrackAutomationTrackId: null,
      activeTrackAutomationType: null,
      trackAutomationRedrawVersion: 0,
      recordingMode: 'audio' as const,
      recordingTargetTrackIndex: 0,
      recordingCommitStartBeatAbsolute: 4,
      recordingAudioPreviewCurrentBeat: 8,
      recordingAudioPreviewPeaks: [{ min: -0.5, max: 0.5 }],
      recordingAudioPreviewFileName: 'Recording',
      timeSignature: { numerator: 4, denominator: 4 },
    };
    return selector ? selector(state) : state;
  },
}));

describe('TrackGridItem recording preview', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: vi.fn(() => ({
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
      })),
    });

    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  it('renders a non-interactive preview region on the recording audio track', () => {
    const track = new KGAudioTrack('Audio Track', 1);
    track.setTrackIndex(0);

    const view = render(
      <TrackGridItem
        track={track}
        index={0}
        isDragging={false}
        isDragOver={false}
        regions={[]}
        maxBars={8}
        selectedRegionId={null}
        gridContainerRef={{ current: document.createElement('div') }}
        onDoubleClick={vi.fn()}
      />
    );

    const previewRegion = view.container.querySelector('[data-preview-region="true"]');
    expect(previewRegion).toBeTruthy();
  });
});
