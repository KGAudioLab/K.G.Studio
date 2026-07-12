import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FLUIDR3_INSTRUMENT_MAP, INSTRUMENT_GROUPS } from '../constants/generalMidiConstants';
import { UserInstrumentRegistry, type UserInstrumentDefinition } from '../core/instruments/UserInstrumentRegistry';
import { KGAudioInterface } from '../core/audio-interface/KGAudioInterface';
import { pitchToNoteNameString } from '../util/midiUtil';
import { isValidProjectName } from '../util/projectNameUtil';
import { showAlert, showConfirm, showPrompt } from '../util/dialogUtil';
import { KGCore } from '../core/KGCore';
import { KGMidiTrack } from '../core/track/KGMidiTrack';
import { KGProjectStorage } from '../core/io/KGProjectStorage';
import './UserInstrumentManager.css';
import { useI18n } from '../i18n/useI18n';
import { getInstrumentDisplayName, getInstrumentGroupLabel, type InstrumentGroupKey } from '../i18n/instruments';

const IMAGES = [
  'accordian.png','baritone_sax.png','bass.png','bassoon.png','brass_ensemble.png','cello.png','clarinet.png','contrabass.png',
  'drawbar_organ.png','drums.png','electric_guitar.png','electric_piano.png','english_horn.png','flute.png','french_horn.png',
  'guitar.png','harmonica.png','harp.png','marimba.png','oboe.png','orchestra_percussion_kit.png','piano.png','piccolo.png','sax.png',
  'shakuhachi.png','soprano_sax.png','speaker.png','string_ensemble.png','synth.png','trombone.png','trumpet.png','tuba.png','viola.png','violin.png',
];

interface Props { onClose: () => void; }

export const UserInstrumentManager: React.FC<Props> = ({ onClose }) => {
  const { t } = useI18n();
  const [items, setItems] = useState(UserInstrumentRegistry.list());
  const [selectedId, setSelectedId] = useState(items[0]?.instrumentId ?? null);
  const [closing, setClosing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [previewingPitch, setPreviewingPitch] = useState<number | null>(null);
  const dirty = useRef(new Set<string>());
  const pendingWrites = useRef(new Set<Promise<unknown>>());
  const previewAudio = useRef<HTMLAudioElement | null>(null);
  const previewUrl = useRef<string | null>(null);
  const selected = items.find(item => item.instrumentId === selectedId);
  const refresh = () => setItems(UserInstrumentRegistry.list());

  useEffect(() => UserInstrumentRegistry.subscribe(refresh), []);
  useEffect(() => setNameDraft(selected?.displayName ?? ''), [selected?.instrumentId, selected?.displayName]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') void close(); };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });
  useEffect(() => () => stopPreview(), []);

  const stopPreview = () => {
    previewAudio.current?.pause();
    previewAudio.current = null;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreviewingPitch(null);
  };

  const close = async () => {
    if (closing) return;
    setClosing(true);
    try {
      await Promise.allSettled([...pendingWrites.current]);
      await KGAudioInterface.instance().refreshUserInstruments(dirty.current);
    }
    catch (error) { console.error(error); await showAlert(t('userInstrument.error.reload')); }
    onClose();
  };

  const add = async () => {
    const name = await showPrompt(t('userInstrument.prompt.name'));
    if (name === null) return;
    if (!isValidProjectName(name)) { await showAlert(t('userInstrument.error.invalidName')); return; }
    const created = await UserInstrumentRegistry.create(name);
    dirty.current.add(created.instrumentId); setSelectedId(created.instrumentId); refresh();
  };

  const update = async (patch: Partial<UserInstrumentDefinition>) => {
    if (!selected) return;
    const id = selected.instrumentId;
    const write = UserInstrumentRegistry.update(id, patch);
    pendingWrites.current.add(write);
    try { await write; dirty.current.add(id); }
    catch (error) {
      const message = (error as Error).message;
      await showAlert(message === 'At least one in-range sample is required'
        ? t('userInstrument.error.sampleRequired')
        : message === 'Invalid instrument name'
          ? t('userInstrument.error.invalidName')
          : t('userInstrument.error.update'));
    }
    finally { pendingWrites.current.delete(write); }
  };

  const upload = async (pitch: number, file?: File) => {
    if (!selected || !file) return;
    if (!UserInstrumentRegistry.isSupportedAudioFile(file)) { await showAlert(t('userInstrument.error.unsupportedFile')); return; }
    const existing = selected.samples[String(pitch)];
    if (existing && !await showConfirm(t('userInstrument.confirm.replaceSample', { file: existing.originalFileName, pitch: pitchToNoteNameString(pitch) }))) return;
    try {
      // Decode before persisting to reject corrupt/unsupported files.
      const context = new AudioContext();
      await context.decodeAudioData(await file.arrayBuffer());
      await context.close();
      await UserInstrumentRegistry.storeSample(selected.instrumentId, pitch, file);
      dirty.current.add(selected.instrumentId);
    } catch { await showAlert(t('userInstrument.error.decode')); }
  };

  const removeSample = async (pitch: number) => {
    if (!selected || !await showConfirm(t('userInstrument.confirm.deleteSample', { pitch: pitchToNoteNameString(pitch) }))) return;
    await UserInstrumentRegistry.deleteSample(selected.instrumentId, pitch); dirty.current.add(selected.instrumentId);
  };

  const playSample = async (pitch: number) => {
    if (!selected) return;
    if (previewingPitch === pitch && previewAudio.current) {
      stopPreview();
      return;
    }
    stopPreview();
    try {
      const file = await UserInstrumentRegistry.getSampleFile(selected.instrumentId, pitch);
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      previewUrl.current = url;
      previewAudio.current = audio;
      setPreviewingPitch(pitch);
      audio.addEventListener('ended', stopPreview, { once: true });
      audio.addEventListener('error', stopPreview, { once: true });
      await audio.play();
    } catch (error) {
      stopPreview();
      console.error('Failed to preview custom instrument sample:', error);
      await showAlert(t('userInstrument.error.preview'));
    }
  };

  const removeInstrument = async () => {
    if (!selected) return;
    const currentTracks = KGCore.instance().getCurrentProject().getTracks().filter(t => t instanceof KGMidiTrack && t.getInstrument() === selected.instrumentId);
    let projectCount = 0;
    try {
      const storage = KGProjectStorage.getInstance();
      const names = await storage.list();
      for (const name of names) {
        const project = await storage.load(name);
        if (project?.getTracks().some(t => t instanceof KGMidiTrack && t.getInstrument() === selected.instrumentId)) projectCount++;
      }
    } catch { /* current project information is still useful */ }
    const detail = t('userInstrument.confirm.deleteDetail', { tracks: currentTracks.length, projects: projectCount });
    if (!await showConfirm(`${t('userInstrument.confirm.deleteInstrument', { name: selected.displayName })}\n\n${detail}`, { confirmLabel: t('userInstrument.delete') })) return;
    const id = selected.instrumentId;
    await UserInstrumentRegistry.delete(id); dirty.current.add(id);
    const remaining = UserInstrumentRegistry.list(); setSelectedId(remaining[0]?.instrumentId ?? null);
  };

  const pitches = useMemo(() => selected ? Array.from({ length: selected.pitchRange[1] - selected.pitchRange[0] + 1 }, (_, i) => selected.pitchRange[0] + i) : [], [selected]);
  const pianoRangePitches = useMemo(() => Array.from({ length: 88 }, (_, index) => index + 21), []);

  return <div className="user-instrument-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) void close(); }}>
    <div className="user-instrument-dialog" role="dialog" aria-modal="true" aria-label={t('userInstrument.manage')}>
      <header><h2>{t('userInstrument.title')}</h2><button onClick={() => void close()} disabled={closing} aria-label={t('userInstrument.close')}>✕</button></header>
      <div className="user-instrument-body">
        <aside><div className="instrument-list-scroll">{items.map(item => <button key={item.instrumentId} className={item.instrumentId === selectedId ? 'active' : ''} onClick={() => setSelectedId(item.instrumentId)}>{item.displayName}<small className={item.enabled ? 'enabled' : ''}>{t(item.enabled ? 'userInstrument.status.enabled' : 'userInstrument.status.disabled')}</small></button>)}</div><button className="add-instrument" onClick={() => void add()}>{t('userInstrument.add')}</button></aside>
        <main>{selected ? <>
          <div className="instrument-fields">
            <label className="field-name">{t('userInstrument.field.name')}<input value={nameDraft} onChange={e => setNameDraft(e.target.value)} onBlur={() => { if (nameDraft !== selected.displayName) void update({ displayName: nameDraft }); }}/></label>
            <label className="field-lower">{t('userInstrument.field.lowerPitch')}<select value={selected.pitchRange[0]} onChange={e => void update({ pitchRange: [Number(e.target.value), selected.pitchRange[1]] })}>{pianoRangePitches.filter(pitch => pitch <= selected.pitchRange[1]).map(pitch => <option key={pitch} value={pitch}>{pitchToNoteNameString(pitch)}</option>)}</select></label>
            <label className="field-upper">{t('userInstrument.field.upperPitch')}<select value={selected.pitchRange[1]} onChange={e => void update({ pitchRange: [selected.pitchRange[0], Number(e.target.value)] })}>{pianoRangePitches.filter(pitch => pitch >= selected.pitchRange[0]).map(pitch => <option key={pitch} value={pitch}>{pitchToNoteNameString(pitch)}</option>)}</select></label>
            <label className="field-image">{t('userInstrument.field.image')}<span className="image-field"><img src={`${import.meta.env.BASE_URL}resources/instruments/${selected.image}`} alt=""/><select value={selected.image} onChange={e => void update({ image: e.target.value })}>{IMAGES.map(image => <option key={image} value={image}>{image.replace(/\.png$/i, '')}</option>)}</select></span></label>
            <label className="field-fallback">{t('userInstrument.field.fallback')}<select value={selected.fallbackInstrument} onChange={e => void update({ fallbackInstrument: e.target.value })}>{Object.keys(INSTRUMENT_GROUPS).map(group => <optgroup key={group} label={getInstrumentGroupLabel(group as InstrumentGroupKey, t)}>{Object.entries(FLUIDR3_INSTRUMENT_MAP).filter(([, value]) => value.group === group).map(([id]) => <option key={id} value={id}>{getInstrumentDisplayName(id, t)}</option>)}</optgroup>)}</select></label>
            <div className="field-actions"><label className="check"><input type="checkbox" checked={selected.enabled} onChange={e => void update({ enabled: e.target.checked })}/> {t('userInstrument.field.enabled')}</label><label className="check"><input type="checkbox" checked={selected.percussion} onChange={e => void update({ percussion: e.target.checked })}/> {t('userInstrument.field.percussion')}</label><button className="delete-instrument" onClick={() => void removeInstrument()}>{t('userInstrument.deleteInstrument')}</button></div>
          </div>
          <div className="sample-table-hint">{t('userInstrument.sampleHint')}</div>
          <div className="sample-table"><table><thead><tr><th>{t('userInstrument.table.pitch')}</th><th>{t('userInstrument.table.soundFile')}</th><th></th></tr></thead><tbody>{pitches.map(pitch => { const sample = selected.samples[String(pitch)]; const isPreviewing = previewingPitch === pitch; return <tr key={pitch} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void upload(pitch, e.dataTransfer.files[0]); }}><td>{pitchToNoteNameString(pitch)}</td><td>{sample ? <span className="sample-file"><button className={`sample-preview-button${isPreviewing ? ' playing' : ''}`} aria-label={t(isPreviewing ? 'userInstrument.preview.stopAria' : 'userInstrument.preview.playAria', { file: sample.originalFileName })} title={t(isPreviewing ? 'userInstrument.preview.stop' : 'userInstrument.preview.play')} onClick={() => void playSample(pitch)}><span/></button><span className="sample-file-name">{sample.originalFileName}</span></span> : <label className="upload-link">{t('userInstrument.uploadSound')}<input type="file" accept=".wav,.mp3,audio/wav,audio/mpeg" onChange={e => void upload(pitch, e.target.files?.[0])}/></label>}</td><td>{sample && <button className="link-button" onClick={() => void removeSample(pitch)}>{t('userInstrument.delete')}</button>}</td></tr>; })}</tbody></table></div>
        </> : <div className="empty-instruments">{t('userInstrument.empty')}</div>}</main>
      </div>
    </div>
  </div>;
};
