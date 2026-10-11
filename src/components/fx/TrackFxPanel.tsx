import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { TbPlus, TbCopy, TbDeviceFloppy, TbFolderOpen } from 'react-icons/tb';
import { useI18n } from '../../i18n/useI18n';
import { showAlert, showChoice, showConfirm, showPrompt } from '../../util/dialogUtil';
import EqCard from './EqCard';
import type { KGTrack } from '../../core/track/KGTrack';
import ReverbCard from './ReverbCard';
import CompressorCard from './CompressorCard';
import LimiterCard from './LimiterCard';
import AddFxDialog from './AddFxDialog';
import ImportFxDialog from './ImportFxDialog';
import LoadFxPresetDialog from './LoadFxPresetDialog';
import { isValidFXPresetName, serializeFXPreset } from '../../core/fx/fxPresets';
import { fxPresetStorage, FXPresetExistsError } from '../../core/io/FXPresetStorage';
import { useProjectStore } from '../../stores/projectStore';
import { toFxPreview, fromFxPreview, type FxInstance, type FXViewState } from './fxPreviewState';
import { createFX, type KGFX } from '../../core/fx';
import { KGCommandHistory } from '../../core/commands/KGCommandHistory';
import { SetTrackFXCommand } from '../../core/commands/track/SetTrackFXCommand';

// Only presentation state is temporary; effect settings belong to the track.
const views = new WeakMap<KGTrack, Map<number, FXViewState>>();

export default function TrackFxPanel({ track, hidden }: { track: KGTrack | null; hidden: boolean }) {
  const { t } = useI18n();
  const [, redraw] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const dragAllowed = useRef(false);
  const confirmingRemoval = useRef(false);
  const [dialogTrack, setDialogTrack] = useState<KGTrack | null>(null);
  const closeDialog = useCallback(() => setDialogTrack(null), []);
  const tracks = useProjectStore(state => state.tracks);
  const [importTrack, setImportTrack] = useState<KGTrack | null>(null);
  const closeImportDialog = useCallback(() => setImportTrack(null), []);
  useEffect(() => {
    if (hidden || importTrack !== track || (importTrack && !tracks.includes(importTrack))) closeImportDialog();
  }, [hidden, track, importTrack, tracks, closeImportDialog]);
  const [presetTrack, setPresetTrack] = useState<KGTrack | null>(null);
  const closePresetDialog = useCallback(() => setPresetTrack(null), []);
  const savingPreset = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const destination = useRef({ track, hidden });
  destination.current = { track, hidden };
  useEffect(() => {
    if (hidden || presetTrack !== track || (presetTrack && !tracks.includes(presetTrack))) closePresetDialog();
  }, [hidden, track, presetTrack, tracks, closePresetDialog]);
  const savePreset = async () => {
    if (!track || savingPreset.current) return;
    const snapshot = serializeFXPreset(track.getFX());
    savingPreset.current = true;
    try {
      const name = await showPrompt(t('fx.preset.savePrompt'), '', { confirmLabel: t('fx.save'), cancelLabel: t('dialog.cancel') });
      if (name === null || name === '') return;
      if (!isValidFXPresetName(name)) { await showAlert(t(name.trim().toLowerCase() === 'default' ? 'fx.preset.reserved' : 'toolbar.projectName.invalid')); return; }
      try { await fxPresetStorage.save(name, snapshot); }
      catch (error) {
        if (!(error instanceof FXPresetExistsError)) throw error;
        if (await showConfirm(t('fx.preset.overwrite', { name }), { confirmLabel: t('fx.preset.overwriteButton'), cancelLabel: t('dialog.cancel') })) await fxPresetStorage.save(name, snapshot, true);
      }
    } catch { await showAlert(t('fx.preset.error')); }
    finally { savingPreset.current = false; }
  };
  const [dragging, setDragging] = useState<{ track: KGTrack; id: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: number; after: boolean } | null>(null);
  useEffect(() => {
    if (hidden || dialogTrack !== track) closeDialog();
  }, [hidden, track, dialogTrack, closeDialog]);
  const effects = track?.getFX() ?? [];
  const instances = effects.map(effect => toFxPreview(effect, track ? views.get(track)?.get(effect.getId()) : undefined));
  const save = (next: readonly KGFX[], mergeKey?: string, owner = track) => {
    if (!owner) return;
    KGCommandHistory.instance().executeCommand(new SetTrackFXCommand(owner, next, mergeKey), { rethrow: true });
    redraw(revision => revision + 1);
  };
  const update = (next: FxInstance) => {
    if (!track) return;
    const view = views.get(track) ?? new Map<number, FXViewState>();
    view.set(next.id, { expanded: next.state.expanded, selectedBand: next.type === 'eq' ? next.state.selectedBand : 1 });
    views.set(track, view);
    const previous = instances.find(instance => instance.id === next.id);
    if (!previous) return;
    const changed = Object.keys(next.state).filter(key => key !== 'expanded' && key !== 'selectedBand'
      && JSON.stringify(previous.state[key as keyof typeof previous.state]) !== JSON.stringify(next.state[key as keyof typeof next.state]));
    if (changed.length) save(effects.map(effect => effect.getId() === next.id ? fromFxPreview(next) : effect),
      changed.includes('enabled') ? undefined : `${next.id}:${changed.join(',')}`);
    else redraw(revision => revision + 1);
  };
  const remove = async (instance: FxInstance) => {
    if (!track || confirmingRemoval.current) return;
    const owner = track;
    confirmingRemoval.current = true;
    try {
      const confirmed = await showConfirm(t('fx.removeConfirm', { effect: t(`fx.${instance.type}.title`) }), {
        confirmLabel: t('fx.removeConfirm.delete'),
        cancelLabel: t('dialog.cancel'),
      });
      if (!confirmed) return;
      // Read the latest list and retain the originating track across the async confirmation.
      save(owner.getFX().filter(entry => entry.getId() !== instance.id), undefined, owner);
    } finally {
      confirmingRemoval.current = false;
    }
  };
  const renderCard = (instance: FxInstance) => {
    switch (instance.type) {
      case 'eq': return <EqCard trackId={track ? String(track.getId()) : undefined} effectId={instance.id} visible={!hidden} state={instance.state} onChange={state => update({ ...instance, state })} onRemove={() => void remove(instance)} />;
      case 'reverb': return <ReverbCard state={instance.state} onChange={state => update({ ...instance, state })} onRemove={() => void remove(instance)} />;
      case 'compressor': return <CompressorCard trackId={track ? String(track.getId()) : undefined} effectId={instance.id} visible={!hidden} state={instance.state} onChange={state => update({ ...instance, state })} onRemove={() => void remove(instance)} />;
      case 'limiter': return <LimiterCard trackId={track ? String(track.getId()) : undefined} effectId={instance.id} visible={!hidden} state={instance.state} onChange={state => update({ ...instance, state })} onRemove={() => void remove(instance)} />;
    }
  };
  const move = (source: number, target: number, after: boolean) => {
    if (source === target) return;
    const moving = effects.find(effect => effect.getId() === source);
    if (!moving) return;
    const next = effects.filter(effect => effect.getId() !== source);
    const targetIndex = next.findIndex(effect => effect.getId() === target);
    if (targetIndex < 0) return;
    next.splice(targetIndex + (after ? 1 : 0), 0, moving);
    save(next);
  };
  const isAfter = (event: DragEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2;
  };
  const finishDrag = () => { setDragging(null); setDropTarget(null); dragAllowed.current = false; };
  return (
    <div ref={panel} className="track-fx-panel" hidden={hidden}>
      {track && instances.map(instance => (
        <div key={instance.id} className={`fx-sortable${dragging?.track === track && dragging.id === instance.id ? ' is-dragging' : ''}${dragging?.track === track && dropTarget?.id === instance.id ? ` drop-${dropTarget.after ? 'after' : 'before'}` : ''}`}
          onMouseDownCapture={event => {
            const target = event.target as HTMLElement;
            dragAllowed.current = !!target.closest('.fx-card-header') && !target.closest('button');
          }}
          onDragStart={event => {
            if (!dragAllowed.current) { event.preventDefault(); return; }
            event.stopPropagation();
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(instance.id));
            setDragging({ track, id: instance.id });
          }}
          onDragOver={event => {
            if (dragging?.track !== track) return;
            event.preventDefault(); event.stopPropagation();
            event.dataTransfer.dropEffect = 'move';
            setDropTarget(dragging.id === instance.id ? null : { id: instance.id, after: isAfter(event) });
            if (panel.current) {
              const rect = panel.current.getBoundingClientRect();
              if (event.clientY > rect.bottom - 32) panel.current.scrollTop += 12;
              else if (event.clientY < rect.top + 32) panel.current.scrollTop -= 12;
            }
          }}
          onDragLeave={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
          }}
          onDrop={event => {
            if (dragging?.track !== track) return;
            event.preventDefault(); event.stopPropagation();
            move(dragging.id, instance.id, isAfter(event));
            finishDrag();
          }}
          onDragEnd={event => { event.stopPropagation(); finishDrag(); }}
          onKeyDownCapture={event => {
            if (!(event.target as HTMLElement).closest('.fx-card-title') || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const index = instances.findIndex(entry => entry.id === instance.id);
            const neighbor = instances[index + (event.key === 'ArrowUp' ? -1 : 1)];
            if (neighbor) move(instance.id, neighbor.id, event.key === 'ArrowDown');
          }}>
          {renderCard(instance)}
        </div>
      ))}
      <div className="fx-add-button">
        <button type="button" className="fx-action-button" disabled={!track} onClick={() => setDialogTrack(track)}>
          <TbPlus aria-hidden="true" />{t('fx.add')}
        </button>
        <button type="button" className="fx-action-button" disabled={!track} onClick={() => setImportTrack(track)}><TbCopy aria-hidden="true" />{t('fx.import')}</button>
        <button type="button" className="fx-action-button" disabled={!track} onClick={() => void savePreset()}><TbDeviceFloppy aria-hidden="true" />{t('fx.save')}</button>
        <button type="button" className="fx-action-button" disabled={!track} onClick={() => setPresetTrack(track)}><TbFolderOpen aria-hidden="true" />{t('fx.load')}</button>
      </div>
      {track && presetTrack === track && !hidden && <LoadFxPresetDialog onClose={closePresetDialog} onLoad={async preset => {
        const owner = track;
        const valid = () => mounted.current && destination.current.track === owner && !destination.current.hidden && useProjectStore.getState().tracks.includes(owner);
        if (!valid()) return false;
        const action = owner.getFX().length ? await showChoice(t('fx.preset.loadChoice'), [
          { label: t('fx.preset.replace'), value: 'replace' },
          { label: t('fx.preset.append'), value: 'append' },
        ]) : 'replace';
        if (!valid() || !['replace', 'append'].includes(action ?? '')) return false;
        const copies = preset.map(effect => effect.clone(true));
        save(action === 'append' ? [...owner.getFX(), ...copies] : copies, undefined, owner);
        return true;
      }} />}
      {track && importTrack === track && !hidden && <ImportFxDialog tracks={tracks} onClose={closeImportDialog} onImport={(source, effectId) => {
        const currentTracks = useProjectStore.getState().tracks;
        if (!currentTracks.includes(track)) { closeImportDialog(); return; }
        if (!currentTracks.includes(source)) return;
        const effect = source.getFX().find(entry => entry.getId() === effectId);
        if (!effect) return;
        save([...track.getFX(), effect.clone(true)], undefined, track);
        closeImportDialog();
      }} />}
      {track && dialogTrack === track && !hidden && <AddFxDialog onCancel={closeDialog} onAdd={type => {
        save([...effects, createFX(type)]);
        closeDialog();
      }} />}
    </div>
  );
}
