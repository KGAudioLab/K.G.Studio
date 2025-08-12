import React, { useMemo, useState, useEffect } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { INSTRUMENT_GROUPS, FLUIDR3_INSTRUMENT_MAP } from '../constants/generalMidiConstants';
import { KGMidiTrack, type InstrumentType } from '../core/track/KGMidiTrack';

const InstrumentSelection: React.FC = () => {
  const {
    tracks,
    instrumentSelectionTrackId,
    closeInstrumentSelection,
    setTrackInstrument
  } = useProjectStore();

  const targetTrack = useMemo(() => {
    return tracks.find(t => t.getId().toString() === instrumentSelectionTrackId) || null;
  }, [tracks, instrumentSelectionTrackId]);

  const currentInstrumentKey: InstrumentType = (targetTrack && targetTrack instanceof KGMidiTrack)
    ? (targetTrack.getInstrument() as InstrumentType)
    : 'acoustic_grand_piano';

  const currentInstrumentDef = FLUIDR3_INSTRUMENT_MAP[currentInstrumentKey] || FLUIDR3_INSTRUMENT_MAP['acoustic_grand_piano'];

  // Maintain selected group in local state; selected instrument derives from model
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>(currentInstrumentDef?.group || 'PIANO_AND_KEYBOARDS');

  useEffect(() => {
    // Sync when the target track or its instrument changes
    setSelectedGroupKey(currentInstrumentDef?.group || 'PIANO_AND_KEYBOARDS');
  }, [instrumentSelectionTrackId, currentInstrumentKey, currentInstrumentDef]);

  const groups = useMemo(() => Object.entries(INSTRUMENT_GROUPS) as Array<[string, string]>, []);

  const instrumentsInGroup = useMemo(() => {
    return Object.entries(FLUIDR3_INSTRUMENT_MAP)
      .filter((entry) => entry[1].group === selectedGroupKey)
      .map((entry) => ({ key: entry[0], label: entry[1].displayName }));
  }, [selectedGroupKey]);

  const handleSelectGroup = (groupKey: string) => {
    setSelectedGroupKey(groupKey);
  };

  const handleSelectInstrument = async (instrumentKey: string) => {
    const instrument = instrumentKey as InstrumentType;
    if (!targetTrack || !(targetTrack instanceof KGMidiTrack)) return;
    try {
      await setTrackInstrument(targetTrack.getId(), instrument);
    } catch (err) {
      console.error('Failed to change instrument from panel:', err);
    }
  };

  const previewImage = FLUIDR3_INSTRUMENT_MAP[currentInstrumentKey]?.image || 'piano.png';
  const previewAlt = FLUIDR3_INSTRUMENT_MAP[currentInstrumentKey]?.displayName || currentInstrumentKey;

  if (!targetTrack) return null;

  return (
    <div className="instrument-selection">
      <div className="instrument-selection-header">
        <h3>{`${previewAlt.toString()}`}</h3>
        <button className="instrument-selection-close-btn" onClick={closeInstrumentSelection}>✕</button>
      </div>
      <div className="instrument-selection-top">
        <div className="instrument-preview">
          <img
            src={`/resources/instruments/${previewImage}`}
            alt={previewAlt.toString()}
            width={256}
            height={256}
          />
        </div>
        <div className="instrument-name-overlay">{targetTrack.getName()}</div>
      </div>
      <div className="instrument-selection-bottom">
        <div className="instrument-groups">
          <div className="instrument-groups-list">
            {groups.map(([key, label]) => (
              <div
                key={key}
                className={`instrument-group-item${selectedGroupKey === key ? ' active' : ''}`}
                onClick={() => handleSelectGroup(key)}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="instrument-list">
          <div className="instrument-instruments-list">
            {instrumentsInGroup.map((inst) => (
              <div
                key={inst.key}
                className={`instrument-instrument-item${currentInstrumentKey === inst.key ? ' active' : ''}`}
                onClick={() => handleSelectInstrument(inst.key)}
              >
                {inst.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstrumentSelection;


