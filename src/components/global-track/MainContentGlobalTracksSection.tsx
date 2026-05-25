import React, { useEffect, useState } from 'react';
import { FaPlus } from 'react-icons/fa';
import GlobalChordLane from './GlobalChordLane';
import GlobalKeySignatureLane from './GlobalKeySignatureLane';
import GlobalMarkerLane from './GlobalMarkerLane';
import GlobalTempoLane from './GlobalTempoLane';

interface GlobalTrackDefinition {
  id: 'marker' | 'tempo' | 'signature' | 'chord';
  label: string;
}

const GLOBAL_TRACKS: GlobalTrackDefinition[] = [
  { id: 'marker', label: 'Marker' },
  { id: 'tempo', label: 'Tempo' },
  { id: 'signature', label: 'Key Signature' },
  { id: 'chord', label: 'Chord' },
];

interface MainContentGlobalTracksSectionProps {
  visible: boolean;
  onAddMarker: () => void;
  onAddTempo: () => void;
  onAddKeySignature: () => void;
  onAddChord: () => void;
  markerLaneProps: React.ComponentProps<typeof GlobalMarkerLane>;
  tempoLaneProps: React.ComponentProps<typeof GlobalTempoLane>;
  keySignatureLaneProps: React.ComponentProps<typeof GlobalKeySignatureLane>;
  chordLaneProps: React.ComponentProps<typeof GlobalChordLane>;
}

const MainContentGlobalTracksSection: React.FC<MainContentGlobalTracksSectionProps> = ({
  visible,
  onAddMarker,
  onAddTempo,
  onAddKeySignature,
  onAddChord,
  markerLaneProps,
  tempoLaneProps,
  keySignatureLaneProps,
  chordLaneProps,
}) => {
  const [shouldRender, setShouldRender] = useState(visible);
  const [isAnimated, setIsAnimated] = useState(false);

  useEffect(() => {
    if (!visible) {
      setIsAnimated(false);
      return;
    }

    setShouldRender(true);
  }, [visible]);

  useEffect(() => {
    if (!shouldRender || !visible || isAnimated) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      setIsAnimated(true);
    });

    return () => cancelAnimationFrame(frame);
  }, [isAnimated, shouldRender, visible]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div
      className="global-tracks-section"
      aria-label="Global tracks"
      aria-hidden={!visible}
      style={{ ['--global-track-count' as string]: String(GLOBAL_TRACKS.length) }}
    >
      <div
        className={`global-tracks-info-shell${isAnimated ? ' expanded' : ' collapsed'}`}
        onTransitionEnd={() => {
          if (!visible) {
            setShouldRender(false);
          }
        }}
      >
        <div className="global-tracks-info">
          {GLOBAL_TRACKS.map(track => (
            <div key={track.id} className="global-track-info-row">
              <span className="global-track-name">{track.label}</span>
              <button
                type="button"
                className="global-track-add-button"
                aria-label={`Add ${track.label} global track item`}
                title={`Add ${track.label} global track item`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();

                  if (track.id === 'marker') {
                    onAddMarker();
                    return;
                  }

                  if (track.id === 'tempo') {
                    onAddTempo();
                    return;
                  }

                  if (track.id === 'signature') {
                    onAddKeySignature();
                    return;
                  }

                  onAddChord();
                }}
              >
                <FaPlus />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className={`global-tracks-grid-shell${isAnimated ? ' expanded' : ' collapsed'}`}>
        <div className="global-tracks-grid" aria-hidden="true">
          <GlobalMarkerLane {...markerLaneProps} />
          <GlobalTempoLane {...tempoLaneProps} />
          <GlobalKeySignatureLane {...keySignatureLaneProps} />
          <GlobalChordLane {...chordLaneProps} />
        </div>
      </div>
    </div>
  );
};

export default MainContentGlobalTracksSection;
