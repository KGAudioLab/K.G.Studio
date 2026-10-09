import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';
import { KGCore } from '../core/KGCore';
import { ConfigManager } from '../core/config/ConfigManager';
import type { KGMidiRegion } from '../core/region/KGMidiRegion';
import { HumanizeMidiRegionCommand } from '../core/commands/region/HumanizeMidiRegionCommand';
import { AIRE_BASE_URL, AIRE_MODEL_IDS, AIRE_MODELS, aireCache, aireModelUrl } from '../util/aire/config';
import { aireInputSnapshot, buildAireTarget } from '../util/aire/target';
import { runAireWorker, serializeAireCacheTask } from '../util/aire/client';
import { AIRE_CONTROLLERS, AIRE_SIMPLIFICATION_LEVELS, type AireSimplification, type AireController, type AireModelId, type AireProgress as AireProgressState } from '../util/aire/types';
import type { ModelDownloadProgress } from '../util/opfsModelCache';
import { useI18n } from '../i18n/useI18n';
import AireProgress from './AireProgress';
import './common/DialogProvider.css';
import './HumanizePopup.css';
interface Props { region: KGMidiRegion | null; onCancel: () => void; onSuccess: (controller: AireController) => void }
export default function HumanizePopup({ region, onCancel, onSuccess }: Props) {
  const { t } = useI18n();
  const [descriptionBeforeAire, descriptionAfterAire] = t('aire.description').split('AIRE');
  const [modelId, setModelId] = useState<AireModelId>('S03');
  const [role, setRole] = useState('pad');
  const [mood, setMood] = useState('peaceful');
  const [targetController, setTargetController] = useState<AireController>(1);
  const [simplification, setSimplification] = useState<AireSimplification>('medium');
  const [useVelocity, setUseVelocity] = useState(true);
  const [confirmReplacement, setConfirmReplacement] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [download, setDownload] = useState<ModelDownloadProgress | null>(null);
  const [processing, setProcessing] = useState<AireProgressState | null>(null);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const humanizeButton = useRef<HTMLButtonElement>(null);
  const noButton = useRef<HTMLButtonElement>(null);
  const confirmationWasOpen = useRef(false);
  const controlsDisabled = busy || confirmReplacement;
  useEffect(() => {
    if (confirmReplacement) noButton.current?.focus();
    else if (confirmationWasOpen.current) humanizeButton.current?.focus();
    confirmationWasOpen.current = confirmReplacement;
  }, [confirmReplacement]);
  const close = useCallback(() => { controller.current?.abort(); onCancel(); }, [onCancel]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (confirmReplacement) setConfirmReplacement(false);
      else close();
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [close, confirmReplacement]);
  const project = KGCore.instance().getCurrentProject();
  const target = region ? buildAireTarget(project, region) : null;
  const humanize = async (replacementApproved = false) => {
    if (!region || !target || busy || controller.current) return;
    if (!replacementApproved && region.getControllerEvents(targetController).some(e => e.getTick() >= target.startTick && e.getTick() < target.endTick)) {
      setConfirmReplacement(true);
      return;
    }
    setConfirmReplacement(false);
    const abort = new AbortController(); controller.current = abort;
    const signal = abort.signal;
    const snapshot = aireInputSnapshot(project, region, targetController);
    setBusy(true); setError(''); setDownload(null); setProcessing(null); setStage('aire.checking');
    try {
      const model = await serializeAireCacheTask(async () => {
        signal.throwIfAborted();
        const path = AIRE_MODELS[modelId].path;
        if (!await aireCache.exists(path)) {
          signal.throwIfAborted(); setStage('aire.downloading');
          const base = ConfigManager.instance().get('general.aire.base_url') as string || AIRE_BASE_URL;
          await aireCache.download(aireModelUrl(base, modelId), path, { signal }, value => { if (!signal.aborted && mounted.current) setDownload(value); });
        }
        signal.throwIfAborted();
        return aireCache.getArrayBuffer(path);
      });
      signal.throwIfAborted(); setStage('aire.processing'); setDownload(null);
      const points = await runAireWorker({ model, options: { modelId, mood, role, useVelocity }, sections: target.sections, simplification }, signal,
        value => { if (mounted.current && !signal.aborted) setProcessing(value); });
      signal.throwIfAborted();
      const currentProject = KGCore.instance().getCurrentProject();
      if (currentProject !== project || !project.getTracks().some(track => track.getRegions().includes(region)) || aireInputSnapshot(project, region, targetController) !== snapshot) throw new Error(t('aire.stale'));
      const relativePoints = points.map(point => ({ ...point, tick: point.tick - region.getStartTick() }));
      KGCore.instance().executeCommand(new HumanizeMidiRegionCommand(region, target.startTick, target.endTick, relativePoints, targetController), { rethrow: true });
      onSuccess(targetController);
    } catch (e) {
      if (!signal.aborted && mounted.current) setError(t('aire.failed', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      controller.current = null;
      if (mounted.current && !signal.aborted) { setBusy(false); setStage(''); setDownload(null); setProcessing(null); }
    }
  };
  let percent: number | null = null;
  let progressText = stage ? t(stage) : '';
  if (download) {
    percent = download.totalBytes ? download.percent : null;
    progressText = download.totalBytes ? t('aire.downloadProgress', { percent: Math.floor(download.percent) }) : t('aire.downloading');
  } else if (processing && processing.total > 1) {
    percent = processing.completed / processing.total * 100;
    progressText = t('aire.processingProgress', { completed: processing.completed, total: processing.total });
  }
  return createPortal(<><div className="dialog-overlay transpose-popup-backdrop" onMouseDown={close} inert={confirmReplacement} aria-hidden={confirmReplacement || undefined}>
    <div className="dialog-modal transpose-popup" role="dialog" aria-modal="true" aria-label={t('aire.dialogTitle')}
      onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
      <div className="dialog-header"><h3 className="dialog-title">{t('aire.dialogTitle')}</h3>
        <button className="dialog-close-btn" type="button" aria-label={t('dialog.close')} onClick={close}><FaTimes /></button></div>
      <div className="dialog-body"><div className="dialog-chord-detection-form">
        <div className="dialog-hint-card"><div className="dialog-hint-card-text">
          {descriptionBeforeAire}<a href="https://huggingface.co/KGAudioLab/instrument-aire-models" target="_blank" rel="noopener noreferrer">AIRE</a>{descriptionAfterAire}
        </div></div>
        <div className="dialog-slider-group">
          <label className="dialog-slider-label" htmlFor="aire-family">{t('aire.family')}</label>
          <select id="aire-family" className="dialog-input dialog-compact-input settings-select" value={modelId} disabled={controlsDisabled} onChange={e => {
            const id = e.target.value as AireModelId; setModelId(id);
            if (!AIRE_MODELS[id].moods.includes(mood)) setMood('peaceful');
          }}>{AIRE_MODEL_IDS.map(id => <option key={id} value={id}>{t(`aire.family.${id}`)}</option>)}</select>
        </div>
        <div className="dialog-slider-group">
          <label className="dialog-slider-label" htmlFor="aire-role">{t('aire.role')}</label>
          <select id="aire-role" className="dialog-input dialog-compact-input settings-select" value={role} disabled={controlsDisabled} onChange={e => setRole(e.target.value)}>{AIRE_MODELS[modelId].roles.map(value => <option key={value} value={value}>{t(`aire.role.${value}`)}</option>)}</select>
        </div>
        <div className="dialog-slider-group">
          <label className="dialog-slider-label" htmlFor="aire-mood">{t('aire.mood')}</label>
          <select id="aire-mood" className="dialog-input dialog-compact-input settings-select" value={mood} disabled={controlsDisabled} onChange={e => setMood(e.target.value)}>{AIRE_MODELS[modelId].moods.map(value => <option key={value} value={value}>{t(`aire.mood.${value}`)}</option>)}</select>
        </div>
        <div className="dialog-slider-group">
          <label className="dialog-slider-label" htmlFor="aire-controller">{t('aire.targetController')}</label>
          <select id="aire-controller" className="dialog-input dialog-compact-input settings-select" value={targetController} disabled={controlsDisabled} onChange={e => {
            setTargetController(Number(e.target.value) as AireController); setConfirmReplacement(false);
          }}>{AIRE_CONTROLLERS.map(controller => <option key={controller} value={controller}>{t(`aire.controller.${controller}`)}</option>)}</select>
        </div>
        <div className="dialog-slider-group">
          <label className="dialog-slider-label" htmlFor="aire-simplification">{t('aire.simplification')}</label>
          <select id="aire-simplification" className="dialog-input dialog-compact-input settings-select" value={simplification} disabled={controlsDisabled} onChange={e => setSimplification(e.target.value as AireSimplification)}>
            {AIRE_SIMPLIFICATION_LEVELS.map(level => <option key={level} value={level}>{t(`aire.simplification.${level}`)}</option>)}
          </select>
        </div>
        <div className="dialog-hint-card-text">{t('aire.simplificationHelp')}</div>
        <label className="dialog-checkbox-row">
          <input type="checkbox" checked={useVelocity} disabled={controlsDisabled} onChange={e => setUseVelocity(e.target.checked)} />
          <span>{t('aire.useVelocity')}</span>
        </label>
        <div className="dialog-hint-card-text">{t('aire.useVelocityHelp')}</div>
        {!target && <p>{t('aire.noTarget')}</p>}
        {busy && <AireProgress percent={percent} text={progressText} />}
        {error && <p role="alert">{error}</p>}
      </div></div>
      <div className="dialog-footer"><button className="dialog-btn dialog-btn-cancel" type="button" onClick={close}>{t('dialog.cancel')}</button>
        <button ref={humanizeButton} className="dialog-btn dialog-btn-primary" type="button" disabled={!target || controlsDisabled} onClick={() => void humanize()}>{t('aire.humanize')}</button></div>
    </div>
  </div>
    {confirmReplacement && <div className="dialog-overlay aire-replacement-overlay" onMouseDown={() => setConfirmReplacement(false)}>
      <div className="dialog-modal" role="alertdialog" aria-modal="true" aria-labelledby="aire-replacement-title" aria-describedby="aire-replacement-message"
        onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key !== 'Tab') return;
          const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('button');
          const first = buttons[0], last = buttons[buttons.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }}>
        <div className="dialog-header"><h3 id="aire-replacement-title" className="dialog-title">{t('dialog.title.confirm')}</h3>
          <button className="dialog-close-btn" type="button" aria-label={t('dialog.close')} onClick={() => setConfirmReplacement(false)}><FaTimes /></button></div>
        <div className="dialog-body"><p id="aire-replacement-message" className="dialog-message">{t('aire.replaceConfirm', { controller: targetController })}</p></div>
        <div className="dialog-footer">
          <button ref={noButton} className="dialog-btn dialog-btn-cancel" type="button" onClick={() => setConfirmReplacement(false)}>{t('settings.no')}</button>
          <button className="dialog-btn dialog-btn-primary" type="button" onClick={() => void humanize(true)}>{t('settings.yes')}</button>
        </div>
      </div>
    </div>}
  </>, document.body);
}
