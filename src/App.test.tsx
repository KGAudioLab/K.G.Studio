import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockState = { isPreparingPlayback: false, projectName: 'Test Project' };
let mockActiveLoadCount = 0;
let loadingListener: ((evt: { type: 'start' | 'end'; instrument: string }) => void) | null = null;

vi.mock('./stores/projectStore', () => ({
  useProjectStore: (selector?: (state: typeof mockState) => unknown) => (
    selector ? selector(mockState) : mockState
  ),
}));

vi.mock('./hooks/useGlobalKeyboardHandler', () => ({
  useGlobalKeyboardHandler: () => undefined,
}));

vi.mock('./components/Toolbar', () => ({ default: () => null }));
vi.mock('./components/StatusBar', () => ({ default: () => null }));
vi.mock('./components/MainContent', () => ({ default: () => null }));
vi.mock('./components/InstrumentSelection', () => ({ default: () => null }));
vi.mock('./components/ChatBox', () => ({ default: () => null }));
vi.mock('./components/KGOnePanel', () => ({ default: () => null }));
vi.mock('./components/EventListPanel', () => ({ default: () => null }));
vi.mock('./components/settings', () => ({ SettingsPanel: () => null }));
vi.mock('./util/dialogUtil', () => ({
  showAlert: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./core/audio-interface/KGToneBuffersPool', () => ({
  KGToneBuffersPool: {
    instance: () => ({
      getActiveLoadCount: () => mockActiveLoadCount,
      addLoadingListener: (listener: (evt: { type: 'start' | 'end'; instrument: string }) => void) => {
        loadingListener = listener;
      },
      removeLoadingListener: (listener: (evt: { type: 'start' | 'end'; instrument: string }) => void) => {
        if (loadingListener === listener) {
          loadingListener = null;
        }
      },
    }),
  },
}));
vi.mock('./core/audio-interface/KGOfflineRenderer', () => ({
  KGOfflineRenderer: {
    instance: () => ({
      addRenderingListener: () => undefined,
      removeRenderingListener: () => undefined,
    }),
  },
}));
vi.mock('./core/KGCore', () => ({
  KGCore: {
    instance: () => ({
      getIsMigrating: () => false,
      setMigrationStateChangeCallback: () => undefined,
    }),
  },
}));

import { GlobalLoadingOverlayContainer, PlaybackPreparationOverlayContainer, ProjectTitleSync } from './App';

describe('ProjectTitleSync', () => {
  beforeEach(() => {
    mockState = { isPreparingPlayback: false, projectName: 'Test Project' };
    document.title = 'K.G.Studio';
  });

  it('sets the title from the initial project name', () => {
    render(<ProjectTitleSync />);

    expect(document.title).toBe('K.G.Studio - Test Project');
  });

  it('updates the title when the project name changes', () => {
    const { rerender } = render(<ProjectTitleSync />);

    mockState = { ...mockState, projectName: 'Renamed Project' };
    rerender(<ProjectTitleSync />);

    expect(document.title).toBe('K.G.Studio - Renamed Project');
  });
});

describe('PlaybackPreparationOverlayContainer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockState = { isPreparingPlayback: false, projectName: 'Test Project' };
    mockActiveLoadCount = 0;
    loadingListener = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not appear if preparation finishes before the delay', () => {
    const { rerender } = render(<PlaybackPreparationOverlayContainer />);

    mockState = { ...mockState, isPreparingPlayback: true };
    rerender(<PlaybackPreparationOverlayContainer />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    mockState = { ...mockState, isPreparingPlayback: false };
    rerender(<PlaybackPreparationOverlayContainer />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.queryByText('Preparing playback...')).not.toBeInTheDocument();
  });

  it('appears after 150ms while preparation is still in progress', () => {
    const { rerender } = render(<PlaybackPreparationOverlayContainer />);

    mockState = { ...mockState, isPreparingPlayback: true };
    rerender(<PlaybackPreparationOverlayContainer />);

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(screen.queryByText('Preparing playback...')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText('Preparing playback...')).toBeInTheDocument();
  });

  it('hides once preparation completes after becoming visible', () => {
    const { rerender } = render(<PlaybackPreparationOverlayContainer />);

    mockState = { ...mockState, isPreparingPlayback: true };
    rerender(<PlaybackPreparationOverlayContainer />);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByText('Preparing playback...')).toBeInTheDocument();

    mockState = { ...mockState, isPreparingPlayback: false };
    rerender(<PlaybackPreparationOverlayContainer />);

    expect(screen.queryByText('Preparing playback...')).not.toBeInTheDocument();
  });
});

describe('GlobalLoadingOverlayContainer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockActiveLoadCount = 0;
    loadingListener = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('syncs to the pool active count instead of relying on incremental listener math', () => {
    mockActiveLoadCount = 2;
    render(<GlobalLoadingOverlayContainer />);

    expect(screen.getByText('Loading ... (2)')).toBeInTheDocument();

    mockActiveLoadCount = 0;
    act(() => {
      loadingListener?.({ type: 'end', instrument: 'woodblock' });
    });

    expect(screen.queryByText(/Loading \.\.\./)).not.toBeInTheDocument();
  });
});
