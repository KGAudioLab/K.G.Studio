import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { handlePasteOperation } from './copyPasteUtil';

const mocks = vi.hoisted(() => ({
  copiedItems: [] as KGMidiRegion[],
  selectedTrackId: null as string | null,
  pasteRegionsAtTrack: vi.fn(),
  showAlert: vi.fn(),
}));

vi.mock('../core/KGCore', () => ({
  KGCore: {
    instance: () => ({
      getCopiedItems: () => mocks.copiedItems,
      getPlayheadPosition: () => 12,
    }),
  },
}));

vi.mock('../stores/projectStore', () => ({
  useProjectStore: {
    getState: () => ({
      selectedTrackId: mocks.selectedTrackId,
      showPianoRoll: false,
      activeRegionId: null,
      pasteRegionsAtTrack: mocks.pasteRegionsAtTrack,
      pasteNotesToActiveRegion: vi.fn(),
    }),
  },
}));

vi.mock('./dialogUtil', () => ({
  showAlert: mocks.showAlert,
}));

describe('handlePasteOperation', () => {
  beforeEach(() => {
    mocks.copiedItems = [];
    mocks.selectedTrackId = null;
    mocks.pasteRegionsAtTrack.mockReset();
    mocks.showAlert.mockReset();
  });

  it('pastes multi-track clipboard regions without a selected track', () => {
    mocks.copiedItems = [
      new KGMidiRegion('a', '1', 0, 'A', 0, 4),
      new KGMidiRegion('b', '2', 1, 'B', 4, 4),
    ];
    mocks.pasteRegionsAtTrack.mockReturnValue({ success: true });

    expect(handlePasteOperation()).toEqual({ success: true });
    expect(mocks.pasteRegionsAtTrack).toHaveBeenCalledWith(null, 12);
  });

  it('still requires a selected destination for regions copied from one track', () => {
    mocks.copiedItems = [
      new KGMidiRegion('a', '1', 0, 'A', 0, 4),
      new KGMidiRegion('b', '1', 0, 'B', 4, 4),
    ];

    expect(handlePasteOperation()).toEqual({ success: false });
    expect(mocks.pasteRegionsAtTrack).not.toHaveBeenCalled();
  });

  it('shows the specific paste failure and marks it as handled', () => {
    const message = 'Some of the original tracks are no longer available, so these regions couldn\u2019t be pasted. Please copy the regions again and try once more.';
    mocks.copiedItems = [
      new KGMidiRegion('a', '1', 0, 'A', 0, 4),
      new KGMidiRegion('b', '2', 1, 'B', 4, 4),
    ];
    mocks.pasteRegionsAtTrack.mockReturnValue({ success: false, error: message });

    expect(handlePasteOperation()).toEqual({ success: false, failureMessageShown: true });
    expect(mocks.showAlert).toHaveBeenCalledWith(message);
  });
});
