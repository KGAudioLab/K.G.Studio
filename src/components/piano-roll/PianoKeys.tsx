import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';
import { noteNameToPitch } from '../../util/midiUtil';
import { useProjectStore } from '../../stores/projectStore';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiInput, type LiveMidiNoteActivityEvent } from '../../core/midi-input/KGMidiInput';
import { useI18n } from '../../i18n/useI18n';
import { getPercussionKeyShortLabel, isGmDrumKitInstrument } from '../../i18n/percussion';

interface PianoKeysProps {
  activeRegion: KGMidiRegion | null;
}

function incrementPitchCount(source: Map<number, number>, pitch: number): Map<number, number> {
  const next = new Map(source);
  next.set(pitch, (next.get(pitch) ?? 0) + 1);
  return next;
}

function decrementPitchCount(source: Map<number, number>, pitch: number): Map<number, number> {
  const next = new Map(source);
  const current = next.get(pitch) ?? 0;

  if (current <= 1) {
    next.delete(pitch);
  } else {
    next.set(pitch, current - 1);
  }

  return next;
}

const PianoKeys: React.FC<PianoKeysProps> = ({ activeRegion }) => {
  const { t } = useI18n();
  const [mouseActivePitches, setMouseActivePitches] = useState<Map<number, number>>(new Map());
  const [midiActivePitches, setMidiActivePitches] = useState<Map<number, number>>(new Map());
  const mouseActivePitchesRef = useRef<Map<number, number>>(new Map());
  const tracks = useProjectStore(state => state.tracks);
  const playheadPosition = useProjectStore(state => state.playheadPosition);
  const isPlaying = useProjectStore(state => state.isPlaying);

  // Check if current active region belongs to a drum track
  const isDrumTrack = useMemo(() => {
    if (!activeRegion) return false;
    const track = tracks.find(t => t.getId().toString() === activeRegion.getTrackId());
    return track instanceof KGMidiTrack && isGmDrumKitInstrument(track.getInstrument());
  }, [activeRegion, tracks]);

  const playbackActivePitches = useMemo(() => {
    if (!activeRegion || !isPlaying) {
      return new Set<number>();
    }

    const activePitches = new Set<number>();
    const absolutePlayhead = playheadPosition;
    const regionStartBeat = activeRegion.getStartFromBeat();

    activeRegion.getNotes().forEach(note => {
      const startBeat = regionStartBeat + note.getStartBeat();
      const endBeat = regionStartBeat + note.getEndBeat();

      if (absolutePlayhead >= startBeat && absolutePlayhead < endBeat) {
        activePitches.add(note.getPitch());
      }
    });

    return activePitches;
  }, [activeRegion, isPlaying, playheadPosition]);

  useEffect(() => {
    const midiInput = KGMidiInput.instance();

    const handleLiveNoteActivity = (event: LiveMidiNoteActivityEvent) => {
      setMidiActivePitches(current => (
        event.isNoteOn
          ? incrementPitchCount(current, event.pitch)
          : decrementPitchCount(current, event.pitch)
      ));
    };

    midiInput.addLiveNoteActivityListener(handleLiveNoteActivity);

    return () => {
      midiInput.removeLiveNoteActivityListener(handleLiveNoteActivity);
    };
  }, []);

  // Handle mouse down on piano key
  const handleKeyMouseDown = (keyId: string) => {
    const pitch = noteNameToPitch(keyId);

    // Prevent double pressing the same key
    if ((mouseActivePitchesRef.current.get(pitch) ?? 0) > 0) {
      return;
    }

    // Get the track ID from active region
    if (!activeRegion) {
      console.warn('No active region, cannot play piano key');
      return;
    }

    const trackId = activeRegion.getTrackId();
    
    try {
      // Get audio interface and start playing the note
      const audioInterface = KGAudioInterface.instance();
      if (audioInterface.getIsInitialized()) {
        // Try to start audio context if not started yet
        if (!audioInterface.getIsAudioContextStarted()) {
          audioInterface.startAudioContext().catch(() => {
            // Silently fail if still not allowed - browser policy
          });
        }
        
        // Trigger note attack if audio context is ready
        if (audioInterface.getIsAudioContextStarted()) {
          audioInterface.triggerNoteAttack(trackId, pitch, 127);
          
          const nextMouseActivePitches = incrementPitchCount(mouseActivePitchesRef.current, pitch);
          mouseActivePitchesRef.current = nextMouseActivePitches;
          setMouseActivePitches(nextMouseActivePitches);
          
          console.log(`Started playing piano key: ${keyId} (pitch ${pitch})`);
        }
      }
    } catch (error) {
      console.error(`Error playing piano key ${keyId}:`, error);
    }
  };

  // Handle mouse up on piano key
  const handleKeyMouseUp = (keyId: string) => {
    const pitch = noteNameToPitch(keyId);

    // Only release if key was actually pressed
    if ((mouseActivePitchesRef.current.get(pitch) ?? 0) === 0) {
      return;
    }

    // Get the track ID from active region
    if (!activeRegion) {
      return;
    }

    const trackId = activeRegion.getTrackId();
    
    try {
      // Get audio interface and stop playing the note
      const audioInterface = KGAudioInterface.instance();
      if (audioInterface.getIsInitialized() && audioInterface.getIsAudioContextStarted()) {
        audioInterface.releaseNote(trackId, pitch);
        
        const nextMouseActivePitches = decrementPitchCount(mouseActivePitchesRef.current, pitch);
        mouseActivePitchesRef.current = nextMouseActivePitches;
        setMouseActivePitches(nextMouseActivePitches);
        
        console.log(`Stopped playing piano key: ${keyId} (pitch ${pitch})`);
      }
    } catch (error) {
      console.error(`Error releasing piano key ${keyId}:`, error);
    }
  };

  // Handle mouse leave to ensure keys are released
  const handleKeyMouseLeave = (keyId: string) => {
    handleKeyMouseUp(keyId);
  };

  // Generate piano keys (C0 to C7)
  const generatePianoKeys = () => {
    const octaves = [];
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    // Generate octaves from C0 to C7
    for (let octave = 0; octave <= 7; octave++) {
      const octaveKeys = [];
      
      // Add keys in reverse order (B to C) for each octave
      for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i];
        const isSharp = note.includes('#');
        const keyId = `${note}${octave}`;
        const pitch = noteNameToPitch(keyId);
        const isMouseActive = (mouseActivePitches.get(pitch) ?? 0) > 0;
        const isMidiActive = (midiActivePitches.get(pitch) ?? 0) > 0;
        const isPlaybackActive = playbackActivePitches.has(pitch);
        const showIndicator = isMouseActive || isMidiActive;
        const hasBackgroundFeedback = isMouseActive || isPlaybackActive;
        const keyClass = [
          'piano-key',
          isSharp ? 'sharp' : 'natural',
          isMouseActive ? 'mouse-active' : '',
          isMidiActive ? 'midi-active' : '',
          isPlaybackActive ? 'playback-active' : '',
          hasBackgroundFeedback ? 'visual-active' : '',
        ].filter(Boolean).join(' ');
        const isC = note === 'C';
        
        // For drum tracks, show drum labels when available
        let labelContent = null;
        if (isDrumTrack) {
          const drumLabel = getPercussionKeyShortLabel(pitch, t);
          if (drumLabel) {
            labelContent = <span className="key-label">{drumLabel}</span>;
          }
        } else if (isC) {
          labelContent = <span className="key-label">C{octave}</span>;
        }
        
        octaveKeys.push(
          <div 
            key={keyId} 
            className={keyClass} 
            data-note={keyId}
            onMouseDown={() => handleKeyMouseDown(keyId)}
            onMouseUp={() => handleKeyMouseUp(keyId)}
            onMouseLeave={() => handleKeyMouseLeave(keyId)}
            style={{ 
              cursor: 'pointer',
              userSelect: 'none' // Prevent text selection
            }}
          >
            {labelContent}
            {showIndicator ? <span className="piano-key-activity-dot" data-testid={`piano-key-dot-${keyId}`} /> : null}
          </div>
        );
      }
      
      // Add each octave to the beginning of the array
      octaves.unshift(
        <div key={`octave-${octave}`} className="piano-octave">
          {octaveKeys}
        </div>
      );
    }
    
    return octaves;
  };

  return (
    <div className="piano-keys-container">
      {generatePianoKeys()}
    </div>
  );
};

export default PianoKeys;
