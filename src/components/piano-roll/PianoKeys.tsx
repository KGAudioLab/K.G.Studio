import React, { useState, useRef } from 'react';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';
import { noteNameToPitch, midiPercussionKeyMap, pitchToNoteNameString } from '../../util/midiUtil';
import { useProjectStore } from '../../stores/projectStore';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';

interface PianoKeysProps {
  activeRegion: KGMidiRegion | null;
}

const PianoKeys: React.FC<PianoKeysProps> = ({ activeRegion }) => {
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const { tracks } = useProjectStore();

  // Check if current active region belongs to a drum track
  const isDrumTrack = React.useMemo(() => {
    if (!activeRegion) return false;
    const track = tracks.find(t => t.getId().toString() === activeRegion.getTrackId());
    return track instanceof KGMidiTrack && track.getInstrument() === 'standard';
  }, [activeRegion, tracks]);

  // Handle mouse down on piano key
  const handleKeyMouseDown = (keyId: string) => {
    // Prevent double pressing the same key
    if (pressedKeysRef.current.has(keyId)) {
      return;
    }

    // Get the track ID from active region
    if (!activeRegion) {
      console.warn('No active region, cannot play piano key');
      return;
    }

    const trackId = activeRegion.getTrackId();
    
    try {
      // Convert note name to pitch (keyId is always a note name like "C4")
      const pitch = noteNameToPitch(keyId);
      
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
          
          // Update pressed keys state
          const newPressedKeys = new Set(pressedKeysRef.current);
          newPressedKeys.add(keyId);
          pressedKeysRef.current = newPressedKeys;
          setPressedKeys(newPressedKeys);
          
          console.log(`Started playing piano key: ${keyId} (pitch ${pitch})`);
        }
      }
    } catch (error) {
      console.error(`Error playing piano key ${keyId}:`, error);
    }
  };

  // Handle mouse up on piano key
  const handleKeyMouseUp = (keyId: string) => {
    // Only release if key was actually pressed
    if (!pressedKeysRef.current.has(keyId)) {
      return;
    }

    // Get the track ID from active region
    if (!activeRegion) {
      return;
    }

    const trackId = activeRegion.getTrackId();
    
    try {
      // Convert note name to pitch (keyId is always a note name like "C4")
      const pitch = noteNameToPitch(keyId);
      
      // Get audio interface and stop playing the note
      const audioInterface = KGAudioInterface.instance();
      if (audioInterface.getIsInitialized() && audioInterface.getIsAudioContextStarted()) {
        audioInterface.releaseNote(trackId, pitch);
        
        // Update pressed keys state
        const newPressedKeys = new Set(pressedKeysRef.current);
        newPressedKeys.delete(keyId);
        pressedKeysRef.current = newPressedKeys;
        setPressedKeys(newPressedKeys);
        
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
        const isPressed = pressedKeys.has(keyId);
        const keyClass = `piano-key ${isSharp ? 'sharp' : 'natural'} ${isPressed ? 'pressed' : ''}`;
        const isC = note === 'C';
        
        // For drum tracks, show drum labels when available
        let labelContent = null;
        if (isDrumTrack) {
          const pitch = noteNameToPitch(keyId);
          const drumInfo = midiPercussionKeyMap[pitch];
          if (drumInfo) {
            labelContent = <span className="key-label">{drumInfo.shortName}</span>;
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