import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemPrompts } from './SystemPrompts';
import { KGProject } from '../../core/KGProject';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGGlobalTrack, GlobalTrackType } from '../../core/global-track/KGGlobalTrack';
import { KGMarkerRegion } from '../../core/region/KGMarkerRegion';

const storeState = {
  activeRegionId: null as string | null,
  selectedRegionIds: [] as string[],
};

const configState = new Map<string, unknown>();

const configManagerMock = {
  getIsInitialized: vi.fn(() => true),
  initialize: vi.fn().mockResolvedValue(undefined),
  get: vi.fn((key: string) => configState.get(key)),
};

const coreState = {
  project: new KGProject(),
  selectedItems: [] as unknown[],
};

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: {
    getState: () => storeState,
  },
}));

vi.mock('../../core/config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => configManagerMock,
  },
}));

vi.mock('../../core/KGCore', () => ({
  KGCore: {
    instance: () => ({
      getCurrentProject: () => coreState.project,
      getSelectedItems: () => coreState.selectedItems,
    }),
  },
}));

function createProject(): KGProject {
  const midiTrack = new KGMidiTrack('Piano', 1, 'acoustic_grand_piano');
  const regionA = new KGMidiRegion('midi-a', 'track-1', 0, 'A', 4, 8);
  const regionB = new KGMidiRegion('midi-b', 'track-1', 0, 'B', 20, 4);
  midiTrack.setRegions([regionA, regionB]);

  const markerTrack = new KGGlobalTrack('global-marker', 0, GlobalTrackType.Marker, 'Marker');
  const markerRegion = new KGMarkerRegion('global-a', 'global-marker', 0, 'Marker A', 2, 2);
  markerTrack.setRegions([markerRegion]);

  const project = new KGProject('Test Project');
  project.setTracks([midiTrack]);

  const globalTracks = project.getGlobalTracks();
  const updatedGlobalTracks = globalTracks.map(track => (
    track.getType() === GlobalTrackType.Marker ? markerTrack : track
  ));
  project.setGlobalTracks(updatedGlobalTracks);

  return project;
}

describe('SystemPrompts', () => {
  beforeEach(() => {
    storeState.activeRegionId = null;
    storeState.selectedRegionIds = [];
    coreState.project = createProject();
    coreState.selectedItems = [];
    configState.clear();
    configManagerMock.getIsInitialized.mockReturnValue(true);
    configManagerMock.initialize.mockClear();
    configManagerMock.get.mockClear();
    SystemPrompts.clearCache();

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('prompts/system.md')) {
        return {
          ok: true,
          status: 200,
          text: async () => 'SYSTEM\n- BPM: {bpm}\n- Instrument: {track_instrument}',
        };
      }

      if (url.endsWith('prompts/user_msg_appendix.md')) {
        return {
          ok: true,
          status: 200,
          text: async () => 'APPENDIX\n{selected_music_range_section}',
        };
      }

      return {
        ok: false,
        status: 404,
        text: async () => '',
      };
    }));
  });

  it('uses loop bounds when loop mode is enabled', async () => {
    coreState.project.setIsLooping(true);
    coreState.project.setLoopingRange([2, 5]);

    const prompt = await SystemPrompts.getSystemPromptWithContext();

    expect(prompt).toContain('APPENDIX');
    expect(prompt).toContain('- Start Beat: 8');
    expect(prompt).toContain('- End Beat: 24');
  });

  it('uses the earliest start and latest end across multiple selected regions', async () => {
    storeState.selectedRegionIds = ['midi-a', 'midi-b'];

    const prompt = await SystemPrompts.getSystemPromptWithContext();

    expect(prompt).toContain('- Start Beat: 4');
    expect(prompt).toContain('- End Beat: 24');
  });

  it('includes mixed regular and global selected regions in the music range span', async () => {
    storeState.selectedRegionIds = ['midi-b', 'global-a'];

    const prompt = await SystemPrompts.getSystemPromptWithContext();

    expect(prompt).toContain('- Start Beat: 2');
    expect(prompt).toContain('- End Beat: 24');
  });

  it('renders an explicit absence message when no music range is selected', async () => {
    const prompt = await SystemPrompts.getSystemPromptWithContext();

    expect(prompt).toContain('- No selected music range.');
  });

  it('applies appendix context to the system prompt template', async () => {
    const rendered = await SystemPrompts.getPromptWithContext('Range\n{selected_music_range_section}');

    expect(rendered).toContain('Range');
    expect(rendered).toContain('- No selected music range.');
  });
});
