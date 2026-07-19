import React, { useEffect, useState } from 'react';
import { FaPlus } from 'react-icons/fa';
import GlobalChordLane from './GlobalChordLane';
import GlobalKeySignatureLane from './GlobalKeySignatureLane';
import GlobalMarkerLane from './GlobalMarkerLane';
import GlobalTempoLane from './GlobalTempoLane';
import { useI18n } from '../../i18n/useI18n';
import { Playhead } from '../common';

interface GlobalTrackDefinition {
  id: 'marker' | 'tempo' | 'signature' | 'chord';
  label: string;
}

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
  const { t } = useI18n();
  const [shouldRender, setShouldRender] = useState(visible);
  const [isAnimated, setIsAnimated] = useState(false);
  const globalTracks: GlobalTrackDefinition[] = [
    { id: 'marker', label: t('globalTracks.marker') },
    { id: 'tempo', label: t('globalTracks.tempo') },
    { id: 'signature', label: t('globalTracks.signature') },
    { id: 'chord', label: t('globalTracks.chord') },
  ];

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
      aria-label={t('globalTracks.label')}
      aria-hidden={!visible}
      style={{ ['--global-track-count' as string]: String(globalTracks.length) }}
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
          {globalTracks.map(track => (
            <div key={track.id} className="global-track-info-row">
              <span className="global-track-name">{track.label}</span>
              <button
                type="button"
                className="global-track-add-button"
                aria-label={t('globalTracks.addItem', { label: track.label })}
                title={t('globalTracks.addItem', { label: track.label })}
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
          <Playhead context="main-grid" showTriangle={false} />
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
