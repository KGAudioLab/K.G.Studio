import React, { useMemo, useState } from 'react';
import './ListEventPanel.css';
import { useProjectStore } from '../stores/projectStore';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGMidiTrack } from '../core/track/KGMidiTrack';
import { KGAudioTrack } from '../core/track/KGAudioTrack';
import RegionListEventTab from './list-event-panel/RegionListEventTab';
import TrackListEventTab from './list-event-panel/TrackListEventTab';

interface ListEventPanelProps {
  isVisible: boolean;
}

type ScopeTab = 'region' | 'track';

const ListEventPanel: React.FC<ListEventPanelProps> = ({ isVisible }) => {
  const { tracks, activeRegionId, selectedRegionIds, selectedTrackId } = useProjectStore();
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
    <div className={`list-event-panel${isVisible ? '' : ' is-hidden'}`}>
      <div className="list-event-panel-header">
        <h3>List Event</h3>
      </div>

      <div className="list-event-scope-tabs" role="tablist" aria-label="List event scopes">
        <button
          className={`list-event-scope-tab${scopeTab === 'region' ? ' active' : ''}`}
          type="button"
          onClick={() => setScopeTab('region')}
        >
          Region
        </button>
        <button
          className={`list-event-scope-tab${scopeTab === 'track' ? ' active' : ''}`}
          type="button"
          onClick={() => setScopeTab('track')}
        >
          Track
        </button>
      </div>

      <div className="list-event-panel-body">
        {scopeTab === 'region' ? (
          <RegionListEventTab activeMidiRegion={activeMidiRegion} parentTrack={parentTrack} />
        ) : (
          <TrackListEventTab selectedTrack={selectedTrack} />
        )}
      </div>
    </div>
  );
};

export default ListEventPanel;
