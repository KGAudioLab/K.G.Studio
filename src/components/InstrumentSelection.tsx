import { TbPhotoEdit } from 'react-icons/tb';
import InstrumentImageDialog from './InstrumentImageDialog';
import React, { useMemo, useState, useEffect } from 'react';
import './InstrumentSelection.css';
import { useProjectStore } from '../stores/projectStore';
import { INSTRUMENT_GROUPS, FLUIDR3_INSTRUMENT_MAP } from '../constants/generalMidiConstants';
import type { KGTrack } from '../core/track/KGTrack';
import { KGMidiTrack, type InstrumentType } from '../core/track/KGMidiTrack';
import { KGAudioTrack } from '../core/track/KGAudioTrack';
import { useI18n } from '../i18n/useI18n';
import { getInstrumentDisplayName, getInstrumentGroupLabel, type InstrumentGroupKey } from '../i18n/instruments';
import { UserInstrumentRegistry } from '../core/instruments/UserInstrumentRegistry';
import { resolveInstrumentDefinition } from '../core/instruments/instrumentResolver';
import { resolvePlaybackInstrument } from '../core/instruments/instrumentResolver';
import { UserInstrumentManager } from './UserInstrumentManager';
import TrackFxPanel from './fx/TrackFxPanel';

const CUSTOM_GROUP = 'CUSTOM';

const InstrumentSelection: React.FC = () => {
  const { t } = useI18n();
  const {
    tracks,
    selectedTrackId,
    closeInstrumentSelection,
    setTrackInstrument,
    updateTrackProperties,
    instrumentSelectionTab = 'instrument',
    setInstrumentSelectionTab
  } = useProjectStore();
  const [registryRevision, setRegistryRevision] = useState(0);
  const [imageDialogTrack, setImageDialogTrack] = useState<KGTrack | null>(null);
  const [showManager, setShowManager] = useState(false);
  const activeTab = instrumentSelectionTab;
  useEffect(() => UserInstrumentRegistry.subscribe(() => setRegistryRevision(value => value + 1)), []);

  const targetTrack = useMemo(() => {
    return tracks.find(t => t.getId().toString() === selectedTrackId) || null;
  }, [tracks, selectedTrackId]);

  const currentInstrumentKey: InstrumentType = (targetTrack && targetTrack instanceof KGMidiTrack)
    ? (targetTrack.getInstrument() as InstrumentType)
    : 'acoustic_grand_piano';

  const currentInstrumentDef = resolveInstrumentDefinition(String(currentInstrumentKey)) || resolveInstrumentDefinition('acoustic_grand_piano')!;
  const currentInstrumentGroup = currentInstrumentDef.group || 'PIANO_AND_KEYBOARDS';

  // Maintain selected group in local state; selected instrument derives from model
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>(currentInstrumentGroup);

  useEffect(() => {
    // Sync when the target track or its instrument changes
    setSelectedGroupKey(currentInstrumentGroup);
  }, [selectedTrackId, currentInstrumentKey, currentInstrumentGroup]);

  const groups = useMemo(() => [...Object.keys(INSTRUMENT_GROUPS), CUSTOM_GROUP] as string[], []);

  const instrumentsInGroup = useMemo<Array<{ key: InstrumentType; label: string }>>(() => {
    void registryRevision;
    if (selectedGroupKey === CUSTOM_GROUP) {
      return UserInstrumentRegistry.listEnabled().map(item => ({ key: item.instrumentId as InstrumentType, label: item.displayName }));
    }
    return Object.entries(FLUIDR3_INSTRUMENT_MAP)
      .filter((entry) => entry[1].group === selectedGroupKey)
      .map((entry) => ({ key: entry[0] as InstrumentType, label: getInstrumentDisplayName(entry[0] as InstrumentType, t) }));
  }, [selectedGroupKey, t, registryRevision]);

  const handleSelectGroup = (groupKey: string) => {
    setSelectedGroupKey(groupKey);
  };

  const handleSelectInstrument = async (instrumentKey: InstrumentType) => {
    // If no valid target track, ignore user interaction
    if (!targetTrack || !(targetTrack instanceof KGMidiTrack)) return;
    try {
      await setTrackInstrument(targetTrack.getId(), instrumentKey);
    } catch (err) {
      console.error('Failed to change instrument from panel:', err);
    }
  };

  const isAudioTrack = targetTrack instanceof KGAudioTrack;
  const displayedInstrumentKey = resolvePlaybackInstrument(String(currentInstrumentKey));
  const previewImage = targetTrack?.getResolvedImageName() ?? 'piano.png';
  const previewAlt = isAudioTrack ? 'Audio Track' : (UserInstrumentRegistry.get(displayedInstrumentKey)?.displayName ?? getInstrumentDisplayName(displayedInstrumentKey as InstrumentType, t));
  const hasTargetTrack = !!targetTrack;
  useEffect(() => { setImageDialogTrack(null); }, [targetTrack]);

  return (
      <div className="instrument-selection">
      <div className="instrument-selection-header">
        <div className="instrument-selection-heading">
          <button type="button" className="instrument-image-edit-btn" disabled={!hasTargetTrack}
            aria-label={t('trackImage.choose')} title={t('trackImage.choose')}
            onClick={() => setImageDialogTrack(targetTrack)}><TbPhotoEdit aria-hidden="true" /></button>
          <h3>{hasTargetTrack ? previewAlt : ''}</h3>
        </div>
        <button className="instrument-selection-close-btn" onClick={closeInstrumentSelection}>✕</button>
      </div>
      <div className="instrument-selection-top">
        {hasTargetTrack && (
            <div className="instrument-preview">
              <img
                src={`${import.meta.env.BASE_URL}resources/instruments/${previewImage}`}
                alt={previewAlt.toString()}
                width={256}
                height={256}
              />
            </div>
          )}
          <div className="instrument-name-overlay">{hasTargetTrack ? targetTrack.getName() : ''}</div>
      </div>
      <div className="instrument-selection-bottom">
        <div className="instrument-selection-tabs" role="group" aria-label={t('instrumentSelection.tabs')}>
          <button
            type="button"
            className={`instrument-selection-tab${activeTab === 'instrument' ? ' active' : ''}`}
            aria-pressed={activeTab === 'instrument'}
            onClick={() => setInstrumentSelectionTab('instrument')}
          >
            {t('instrumentSelection.tab.instrument')}
          </button>
          <button
            type="button"
            className={`instrument-selection-tab${activeTab === 'fx' ? ' active' : ''}`}
            aria-pressed={activeTab === 'fx'}
            onClick={() => setInstrumentSelectionTab('fx')}
          >
            {t('instrumentSelection.tab.fx')}
          </button>
        </div>
        <div className="instrument-selection-content">
          <TrackFxPanel track={targetTrack} hidden={activeTab !== 'fx'} />
          {activeTab === 'instrument' && !isAudioTrack && (
            <div className="instrument-selection-browser">
              <div className="instrument-groups">
                <div className="instrument-groups-list">
                  {groups.map((key) => (
                    <div
                      key={key}
                      className={`instrument-group-item${selectedGroupKey === key ? ' active' : ''}`}
                      onClick={() => handleSelectGroup(key)}
                    >
                      {key === CUSTOM_GROUP ? t('instrument.group.CUSTOM') : getInstrumentGroupLabel(key as InstrumentGroupKey, t)}
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
                  {selectedGroupKey === CUSTOM_GROUP && <div className="instrument-instrument-item manage-instruments" onClick={() => setShowManager(true)}>{t('userInstrument.manage')}</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {imageDialogTrack && imageDialogTrack === targetTrack && <InstrumentImageDialog
        imageName={previewImage} onCancel={() => setImageDialogTrack(null)}
        onConfirm={imageName => {
          void updateTrackProperties(imageDialogTrack.getId(), { imageName });
          setImageDialogTrack(null);
        }} />}
      {showManager && <UserInstrumentManager onClose={() => setShowManager(false)}/>}
    </div>
  );
};

export default InstrumentSelection;
