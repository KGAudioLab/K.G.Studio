import React, { useState, useRef, useEffect } from 'react';
import { KGMidiNote } from '../../core/midi/KGMidiNote';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGCore } from '../../core/KGCore';
import { UpdateNotePropertiesCommand } from '../../core/commands/note/UpdateNotePropertiesCommand';
import { useProjectStore } from '../../stores/projectStore';
import { showAlert } from '../../util/dialogUtil';

interface NoteAttributeBarProps {
  selectedNotes: KGMidiNote[];
  isSpectrogram: boolean;
  activeRegion: KGMidiRegion | null;
}

type TextField = 'pitch' | 'length';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function parsePitchInput(raw: string, notes: KGMidiNote[]): number[] | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+') || trimmed.startsWith('-')) {
    const delta = parseInt(trimmed, 10);
    if (isNaN(delta)) return null;
    return notes.map(n => clamp(n.getPitch() + delta, 0, 127));
  }
  const abs = parseInt(trimmed, 10);
  if (isNaN(abs)) return null;
  return notes.map(() => clamp(abs, 0, 127));
}

function parseLengthInput(raw: string): number | null {
  const v = parseFloat(raw.trim());
  if (isNaN(v) || v <= 0) return null;
  return v;
}

interface VelocitySession {
  originalVelocities: number[];
  notes: KGMidiNote[];
}

const NoteAttributeBar: React.FC<NoteAttributeBarProps> = ({ selectedNotes, isSpectrogram, activeRegion }) => {
  const { tracks, updateTrack } = useProjectStore();

  // Text field popup state (pitch / length)
  const [openTextField, setOpenTextField] = useState<TextField | null>(null);
  const [textInputValue, setTextInputValue] = useState('');

  // Velocity slider popup state
  const [velocityOpen, setVelocityOpen] = useState(false);
  const [sliderValue, setSliderValue] = useState(64);
  const [velocityInputValue, setVelocityInputValue] = useState('64');
  const velocitySessionRef = useRef<VelocitySession | null>(null);
  const velocityInputRef = useRef<HTMLInputElement>(null);
  const velocityDirtyRef = useRef(false);
  const lastValidVelocityRef = useRef<number | null>(null);
  const currentVelocityValueRef = useRef(64);

  const barRef = useRef<HTMLDivElement>(null);
  const commitVelocityRef = useRef<(() => void) | null>(null);

  // ── Text field helpers ──────────────────────────────────────────────────────

  const commitTextField = () => {
    if (!openTextField || !activeRegion) { setOpenTextField(null); return; }

    const snapshots = selectedNotes.map(n => ({
      noteId: n.getId(),
      pitch: n.getPitch(),
      velocity: n.getVelocity(),
      startBeat: n.getStartBeat(),
      endBeat: n.getEndBeat(),
    }));

    const updates: { noteId: string; pitch?: number; endBeat?: number }[] = [];

    if (openTextField === 'pitch') {
      const newPitches = parsePitchInput(textInputValue, selectedNotes);
      if (!newPitches) { setOpenTextField(null); return; }
      selectedNotes.forEach((note, i) => updates.push({ noteId: note.getId(), pitch: newPitches[i] }));
    } else {
      const newLength = parseLengthInput(textInputValue);
      if (!newLength) { setOpenTextField(null); return; }
      selectedNotes.forEach(note => updates.push({ noteId: note.getId(), endBeat: note.getStartBeat() + newLength }));
    }

    if (updates.length > 0) {
      const command = new UpdateNotePropertiesCommand(activeRegion.getId(), snapshots, updates);
      KGCore.instance().executeCommand(command);
      const track = tracks.find(t => t.getId().toString() === activeRegion.getTrackId());
      if (track) updateTrack(track);
    }
    setOpenTextField(null);
  };

  const handleTextKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitTextField();
    if (e.key === 'Escape') setOpenTextField(null);
  };

  // ── Velocity slider helpers ─────────────────────────────────────────────────

  const closeVelocityEditor = () => {
    velocitySessionRef.current = null;
    velocityDirtyRef.current = false;
    lastValidVelocityRef.current = null;
    setVelocityOpen(false);
  };

  const previewVelocity = (value: number, inputValue: string = String(value)) => {
    setSliderValue(value);
    setVelocityInputValue(inputValue);
    currentVelocityValueRef.current = value;
    lastValidVelocityRef.current = value;
    velocityDirtyRef.current = true;

    // Live-apply to notes so colors update immediately
    velocitySessionRef.current?.notes.forEach(n => n.setVelocity(value));
    const track = tracks.find(t => t.getId().toString() === activeRegion?.getTrackId());
    if (track) updateTrack(track);
  };

  const commitVelocity = () => {
    const session = velocitySessionRef.current;
    if (!session || !activeRegion) { setVelocityOpen(false); return; }

    const committedVelocity = lastValidVelocityRef.current;
    if (!velocityDirtyRef.current || committedVelocity === null) {
      closeVelocityEditor();
      return;
    }

    // Build snapshots from original velocities captured at open time
    const snapshots = session.notes.map((n, i) => ({
      noteId: n.getId(),
      pitch: n.getPitch(),
      velocity: session.originalVelocities[i], // original, before live edits
      startBeat: n.getStartBeat(),
      endBeat: n.getEndBeat(),
    }));
    const updates = session.notes.map(n => ({ noteId: n.getId(), velocity: committedVelocity }));

    // Restore originals so the command's execute() applies cleanly
    session.notes.forEach((n, i) => n.setVelocity(session.originalVelocities[i]));

    const command = new UpdateNotePropertiesCommand(activeRegion.getId(), snapshots, updates);
    KGCore.instance().executeCommand(command);

    const track = tracks.find(t => t.getId().toString() === activeRegion.getTrackId());
    if (track) updateTrack(track);

    closeVelocityEditor();
  };

  const cancelVelocity = () => {
    const session = velocitySessionRef.current;
    if (session) {
      session.notes.forEach((n, i) => n.setVelocity(session.originalVelocities[i]));
      const track = tracks.find(t => t.getId().toString() === activeRegion?.getTrackId());
      if (track) updateTrack(track);
    }
    closeVelocityEditor();
  };

  // Keep ref current so the outside-click handler always calls the latest commit
  commitVelocityRef.current = commitVelocity;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    previewVelocity(val);
  };

  const handleSliderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') cancelVelocity();
  };

  const handleVelocityInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setVelocityInputValue(raw);

    if (!/^\d+$/.test(raw)) return;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > 127) return;

    previewVelocity(value, raw);
  };

  const handleVelocityInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      commitVelocity();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelVelocity();
      return;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

    e.preventDefault();
    e.stopPropagation();
    const parsedValue = /^\d+$/.test(velocityInputValue) ? Number(velocityInputValue) : NaN;
    const baseValue = Number.isInteger(parsedValue) && parsedValue >= 0 && parsedValue <= 127
      ? parsedValue
      : (lastValidVelocityRef.current ?? currentVelocityValueRef.current);
    previewVelocity(clamp(baseValue + (e.key === 'ArrowUp' ? 1 : -1), 0, 127));
  };

  // ── Outside-click handler ───────────────────────────────────────────────────

  useEffect(() => {
    const isAnyOpen = openTextField !== null || velocityOpen;
    if (!isAnyOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        if (velocityOpen) {
          commitVelocityRef.current?.();
        } else {
          setOpenTextField(null);
        }
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [openTextField, velocityOpen]);

  useEffect(() => {
    if (!velocityOpen) return;
    velocityInputRef.current?.focus();
    velocityInputRef.current?.select();
  }, [velocityOpen]);

  if (isSpectrogram || selectedNotes.length === 0) {
    return <div className="note-attribute-bar" ref={barRef} />;
  }

  // ── Compute display values ─────────────────────────────────────────────────

  let pitch: string;
  let length: string;
  let velocity: string;
  let pitchDefault: string;
  let lengthDefault: string;
  let velocityDefault: number;

  if (selectedNotes.length === 0) {
    pitch = 'N/A'; length = 'N/A'; velocity = 'N/A';
    pitchDefault = ''; lengthDefault = ''; velocityDefault = 64;
  } else if (selectedNotes.length === 1) {
    const note = selectedNotes[0];
    pitch = String(note.getPitch());
    length = (note.getEndBeat() - note.getStartBeat()).toFixed(2);
    velocity = String(note.getVelocity());
    pitchDefault = pitch; lengthDefault = length; velocityDefault = note.getVelocity();
  } else {
    const pitches = selectedNotes.map(n => n.getPitch());
    const lengths = selectedNotes.map(n => (n.getEndBeat() - n.getStartBeat()).toFixed(2));
    const velocities = selectedNotes.map(n => n.getVelocity());
    pitch = pitches.every(p => p === pitches[0]) ? String(pitches[0]) : '--';
    length = lengths.every(l => l === lengths[0]) ? lengths[0] : '--';
    velocity = velocities.every(v => v === velocities[0]) ? String(velocities[0]) : '--';
    pitchDefault = pitch === '--' ? '' : pitch;
    lengthDefault = length === '--' ? '' : length;
    velocityDefault = velocity === '--' ? 64 : velocities[0];
  }

  // ── Field click handlers ───────────────────────────────────────────────────

  const handleTextFieldClick = (field: TextField, defaultVal: string) => {
    if (selectedNotes.length === 0) {
      showAlert('Please select one or more notes to edit their properties.');
      return;
    }
    setTextInputValue(defaultVal);
    setOpenTextField(field);
  };

  const handleVelocityClick = () => {
    if (selectedNotes.length === 0) {
      showAlert('Please select one or more notes to edit their properties.');
      return;
    }
    velocitySessionRef.current = {
      originalVelocities: selectedNotes.map(n => n.getVelocity()),
      notes: [...selectedNotes],
    };
    velocityDirtyRef.current = false;
    lastValidVelocityRef.current = null;
    currentVelocityValueRef.current = velocityDefault;
    setSliderValue(velocityDefault);
    setVelocityInputValue(velocity === '--' ? '' : String(velocityDefault));
    setVelocityOpen(true);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="note-attribute-bar" ref={barRef}>
      {/* Pitch */}
      <span className="attr-item">
        <span className="attr-label">Pitch:</span>
        <div className="quant-dropdown-container">
          <button className="quant-button" onClick={() => handleTextFieldClick('pitch', pitchDefault)}>
            {pitch}
          </button>
          {openTextField === 'pitch' && (
            <div className="note-attr-popup">
              <input
                type="text"
                className="note-attr-input"
                value={textInputValue}
                onChange={e => setTextInputValue(e.target.value)}
                onKeyDown={handleTextKeyDown}
                placeholder="0–127 or ±n"
                autoFocus
              />
            </div>
          )}
        </div>
      </span>

      {/* Length */}
      <span className="attr-item">
        <span className="attr-label">Length:</span>
        <div className="quant-dropdown-container">
          <button className="quant-button" onClick={() => handleTextFieldClick('length', lengthDefault)}>
            {length}
          </button>
          {openTextField === 'length' && (
            <div className="note-attr-popup">
              <input
                type="text"
                className="note-attr-input"
                value={textInputValue}
                onChange={e => setTextInputValue(e.target.value)}
                onKeyDown={handleTextKeyDown}
                placeholder="beats e.g. 1.00"
                autoFocus
              />
            </div>
          )}
        </div>
      </span>

      {/* Velocity */}
      <span className="attr-item">
        <span className="attr-label">Velocity:</span>
        <div className="quant-dropdown-container piano-roll-velocity-control">
          <button className="quant-button piano-roll-velocity-button" onClick={handleVelocityClick}>
            {velocity}
          </button>
          {velocityOpen && (
            <div className="piano-roll-zoom-popup">
              <input
                type="range"
                min="0"
                max="127"
                step="1"
                value={sliderValue}
                onChange={handleSliderChange}
                onKeyDown={handleSliderKeyDown}
              />
              <input
                ref={velocityInputRef}
                type="text"
                inputMode="numeric"
                className="piano-roll-velocity-input"
                aria-label="Velocity"
                value={velocityInputValue}
                placeholder="--"
                onChange={handleVelocityInputChange}
                onKeyDown={handleVelocityInputKeyDown}
              />
            </div>
          )}
        </div>
      </span>
    </div>
  );
};

export default NoteAttributeBar;
