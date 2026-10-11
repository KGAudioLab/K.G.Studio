import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { TbPlus } from 'react-icons/tb';
import { useI18n } from '../../i18n/useI18n';
import { showConfirm } from '../../util/dialogUtil';
import EqCard from './EqCard';
import type { KGTrack } from '../../core/track/KGTrack';
import ReverbCard from './ReverbCard';
import CompressorCard from './CompressorCard';
import LimiterCard from './LimiterCard';
import AddFxDialog from './AddFxDialog';
import { toFxPreview, fromFxPreview, type FxInstance, type FXViewState } from './fxPreviewState';
import { createFX, type KGFX } from '../../core/fx';
import { KGCommandHistory } from '../../core/commands/KGCommandHistory';
import { SetTrackFXCommand } from '../../core/commands/track/SetTrackFXCommand';

// Only presentation state is temporary; effect settings belong to the track.
const views = new WeakMap<KGTrack, Map<string, FXViewState>>();

export default function TrackFxPanel({ track, hidden }: { track: KGTrack | null; hidden: boolean }) {
  const { t } = useI18n();
  const [, redraw] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const dragAllowed = useRef(false);
  const confirmingRemoval = useRef(false);
  const [dialogTrack, setDialogTrack] = useState<KGTrack | null>(null);
  const closeDialog = useCallback(() => setDialogTrack(null), []);
  const [dragging, setDragging] = useState<{ track: KGTrack; id: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);
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
    const view = views.get(track) ?? new Map<string, FXViewState>();
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
      case 'eq': return <EqCard state={instance.state} onChange={state => update({ ...instance, state })} onRemove={() => void remove(instance)} />;
      case 'reverb': return <ReverbCard state={instance.state} onChange={state => update({ ...instance, state })} onRemove={() => void remove(instance)} />;
      case 'compressor': return <CompressorCard state={instance.state} onChange={state => update({ ...instance, state })} onRemove={() => void remove(instance)} />;
      case 'limiter': return <LimiterCard state={instance.state} onChange={state => update({ ...instance, state })} onRemove={() => void remove(instance)} />;
    }
  };
  const move = (source: string, target: string, after: boolean) => {
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
            event.dataTransfer.setData('text/plain', instance.id);
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
      <button type="button" className="fx-add-button" disabled={!track} onClick={() => setDialogTrack(track)}>
        <TbPlus aria-hidden="true" />{t('fx.add')}
      </button>
      {track && dialogTrack === track && !hidden && <AddFxDialog onCancel={closeDialog} onAdd={type => {
        save([...effects, createFX(type)]);
        closeDialog();
      }} />}
    </div>
  );
}
