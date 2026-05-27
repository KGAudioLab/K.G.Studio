import React, { useMemo, useState } from 'react';
import './EventListPanel.css';
import { useProjectStore } from '../stores/projectStore';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGMidiTrack } from '../core/track/KGMidiTrack';
import { KGAudioTrack } from '../core/track/KGAudioTrack';
import RegionEventListTab from './event-list-panel/RegionEventListTab';
import TrackEventListTab from './event-list-panel/TrackEventListTab';
import GlobalEventListTab from './event-list-panel/GlobalEventListTab';

interface EventListPanelProps {
  isVisible: boolean;
}

type ScopeTab = 'region' | 'track' | 'global';

const EventListPanel: React.FC<EventListPanelProps> = ({ isVisible }) => {
  const {
    tracks,
    globalTracks,
    activeRegionId,
    selectedRegionIds,
    selectedTrackId,
    timeSignature,
    playheadPosition,
    refreshProjectState,
  } = useProjectStore();
  const [scopeTab, setScopeTab] = useState<ScopeTab>('region');

  const resolvedRegionId = selectedRegionIds.length > 1
    ? activeRegionId
    : selectedRegionIds.length === 1
      ? selectedRegionIds[0]
      : activeRegionId;

  const selectedTrack = useMemo(() => {
    const track = tracks.find(candidate => candidate.getId().toString() === selectedTrackId) ?? null;
    return track instanceof KGMidiTrack || track instanceof KGAudioTrack ? track : null;
  }, [tracks, selectedTrackId]);

  let activeMidiRegion: KGMidiRegion | null = null;
  let parentTrack: KGMidiTrack | null = null;

  if (resolvedRegionId) {
    for (const track of tracks) {
      const region = track.getRegions().find(candidate => candidate.getId() === resolvedRegionId);
      if (region instanceof KGMidiRegion && track instanceof KGMidiTrack) {
        activeMidiRegion = region;
        parentTrack = track;
        break;
      }
    }
  }

  return (
    <div className={`event-list-panel${isVisible ? '' : ' is-hidden'}`}>
      <div className="event-list-panel-header">
        <h3>Event List</h3>
      </div>

      <div className="event-list-scope-tabs" role="tablist" aria-label="Event list scopes">
        <button
          className={`event-list-scope-tab${scopeTab === 'region' ? ' active' : ''}`}
          type="button"
          onClick={() => setScopeTab('region')}
        >
          Region
        </button>
        <button
          className={`event-list-scope-tab${scopeTab === 'track' ? ' active' : ''}`}
          type="button"
          onClick={() => setScopeTab('track')}
        >
          Track
        </button>
        <button
          className={`event-list-scope-tab${scopeTab === 'global' ? ' active' : ''}`}
          type="button"
          onClick={() => setScopeTab('global')}
        >
          Global
        </button>
      </div>

      <div className="event-list-panel-body">
        {scopeTab === 'region' ? (
          <RegionEventListTab activeMidiRegion={activeMidiRegion} parentTrack={parentTrack} />
        ) : scopeTab === 'track' ? (
          <TrackEventListTab selectedTrack={selectedTrack} />
        ) : (
          <GlobalEventListTab
            globalTracks={globalTracks}
            selectedRegionIds={selectedRegionIds}
            timeSignature={timeSignature}
            playheadPosition={playheadPosition}
            refreshProjectState={refreshProjectState}
          />
        )}
      </div>
    </div>
  );
};

export default EventListPanel;
