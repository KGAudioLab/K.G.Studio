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
import { runtimeProviderLabel } from '../i18n/runtimeProvider';
import AireProgress from './AireProgress';
import './common/DialogProvider.css';
import './HumanizeTab.css';
interface Props {
  region: KGMidiRegion | null;
  trackName?: string;
  isActive: boolean;
  contextKey: string;
  onSuccess: (controller: AireController) => void;
}
export default function HumanizeTab({ region, trackName, isActive, contextKey, onSuccess }: Props) {
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
  const [cached, setCached] = useState(false);
  const [checkingCache, setCheckingCache] = useState(true);
  const [provider, setProvider] = useState('gpu' in navigator ? 'webgpu available' : 'cpu/wasm only');
  useEffect(() => {
    let current = true;
    setCheckingCache(true);
    void serializeAireCacheTask(() => aireCache.exists(AIRE_MODELS[modelId].path)).then(value => {
      if (current) setCached(value);
    }).catch(e => { if (current) setError(String(e)); }).finally(() => { if (current) setCheckingCache(false); });
    return () => { current = false; };
  }, [modelId, busy, isActive]);
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
  const cancel = useCallback(() => {
    const current = controller.current;
    controller.current = null;
    current?.abort();
    setBusy(false); setStage(''); setDownload(null); setProcessing(null);
    setConfirmReplacement(false);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isActive || (!busy && !confirmReplacement) || e.key !== 'Escape') return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (confirmReplacement) setConfirmReplacement(false);
      else cancel();
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [cancel, confirmReplacement, busy, isActive]);
  const project = KGCore.instance().getCurrentProject();
  const target = region ? buildAireTarget(project, region) : null;
  useEffect(() => {
    cancel();
    setError('');
  }, [region, project, isActive, contextKey, cancel]);
  const humanize = async (replacementApproved = false) => {
    if (!isActive || !region || !target || busy || controller.current) return;
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
        value => { if (mounted.current && !signal.aborted) { setProcessing(value); setProvider(value.provider); } });
      signal.throwIfAborted();
      const currentProject = KGCore.instance().getCurrentProject();
      if (currentProject !== project || !project.getTracks().some(track => track.getRegions().includes(region)) || aireInputSnapshot(project, region, targetController) !== snapshot) throw new Error(t('aire.stale'));
      const relativePoints = points.map(point => ({ ...point, tick: point.tick - region.getStartTick() }));
      KGCore.instance().executeCommand(new HumanizeMidiRegionCommand(region, target.startTick, target.endTick, relativePoints, targetController), { rethrow: true });
      onSuccess(targetController);
    } catch (e) {
      if (!signal.aborted && mounted.current) setError(t('aire.failed', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        if (mounted.current && !signal.aborted) { setBusy(false); setStage(''); setDownload(null); setProcessing(null); }
      }
    }
  };
  const manageModel = async (remove: boolean) => {
    if (controlsDisabled || checkingCache || controller.current) return;
    const abort = new AbortController(); controller.current = abort;
    const signal = abort.signal;
    setBusy(true); setError(''); setDownload(null); setStage(remove ? 'kgone.separator.local.btn.deleting' : 'aire.downloading');
    try {
      await serializeAireCacheTask(async () => {
        signal.throwIfAborted();
        const path = AIRE_MODELS[modelId].path;
        if (remove) await aireCache.delete(path);
        else {
          const base = ConfigManager.instance().get('general.aire.base_url') as string || AIRE_BASE_URL;
          await aireCache.download(aireModelUrl(base, modelId), path, { signal }, value => {
            if (mounted.current && !signal.aborted) setDownload(value);
          });
        }
      });
    } catch (e) {
      if (mounted.current && !signal.aborted) setError(t('aire.modelFailed', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        if (mounted.current && !signal.aborted) { setBusy(false); setStage(''); setDownload(null); }
      }
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
  return <>
    <div className="humanize-form kgone-tab-content" inert={confirmReplacement} aria-hidden={confirmReplacement || undefined}>
      <div className="kgone-local-mode-card"><div className="kgone-local-mode-title">{t('aire.dialogTitle')}</div><div className="kgone-local-mode-text">
        {descriptionBeforeAire}<a href="https://huggingface.co/KGAudioLab/instrument-aire-models" target="_blank" rel="noopener noreferrer">AIRE</a>{descriptionAfterAire}
      </div>
        <div className="kgone-runtime-row">
          <div className="kgone-provider-chip">{t('kgone.separator.local.provider')}{runtimeProviderLabel(provider, t)}</div>
          <div className="kgone-provider-chip">{t('kgone.separator.local.model')}{t(`aire.family.${modelId}`)} ({checkingCache ? t('kgone.separator.local.checkingCache') : t(cached ? 'kgone.separator.local.downloaded' : 'kgone.separator.local.notDownloaded')})</div>
        </div>
        <div className="kgone-row">
          <button className="kgone-btn-secondary" type="button" disabled={controlsDisabled || checkingCache} onClick={() => void manageModel(false)}>
            {t(cached ? 'kgone.separator.local.btn.redownload' : 'kgone.separator.local.btn.download')}
          </button>
          {cached && <button className="kgone-btn-secondary kgone-btn-danger" type="button" disabled={controlsDisabled || checkingCache} onClick={() => void manageModel(true)}>{t('kgone.separator.local.btn.deleteCache')}</button>}
        </div>
      </div>
      {region && <div className="kgone-region-info">
        <div className="kgone-region-info-label">{t('kgone.shared.selectedRegion')}</div>
        <div className="kgone-region-info-value">{region.getName()}</div>
        {trackName && <><div className="kgone-region-info-label">{t('kgone.shared.track')}</div>
          <div className="kgone-region-info-value">{trackName}</div></>}
      </div>}
      <div className="kgone-field">
        <label className="kgone-label" htmlFor="aire-family">{t('aire.family')}</label>
        <select id="aire-family" className="kgone-select" value={modelId} disabled={controlsDisabled} onChange={e => {
          const id = e.target.value as AireModelId; setModelId(id);
          if (!AIRE_MODELS[id].moods.includes(mood)) setMood('peaceful');
        }}>{AIRE_MODEL_IDS.map(id => <option key={id} value={id}>{t(`aire.family.${id}`)}</option>)}</select>
      </div>
      <div className="kgone-field">
        <label className="kgone-label" htmlFor="aire-role">{t('aire.role')}</label>
        <select id="aire-role" className="kgone-select" value={role} disabled={controlsDisabled} onChange={e => setRole(e.target.value)}>{AIRE_MODELS[modelId].roles.map(value => <option key={value} value={value}>{t(`aire.role.${value}`)}</option>)}</select>
      </div>
      <div className="kgone-field">
        <label className="kgone-label" htmlFor="aire-mood">{t('aire.mood')}</label>
        <select id="aire-mood" className="kgone-select" value={mood} disabled={controlsDisabled} onChange={e => setMood(e.target.value)}>{AIRE_MODELS[modelId].moods.map(value => <option key={value} value={value}>{t(`aire.mood.${value}`)}</option>)}</select>
      </div>
      <div className="kgone-field">
        <label className="kgone-label" htmlFor="aire-controller">{t('aire.targetController')}</label>
        <select id="aire-controller" className="kgone-select" value={targetController} disabled={controlsDisabled} onChange={e => {
          setTargetController(Number(e.target.value) as AireController); setConfirmReplacement(false);
        }}>{AIRE_CONTROLLERS.map(controller => <option key={controller} value={controller}>{t(`aire.controller.${controller}`)}</option>)}</select>
      </div>
      <div className="kgone-field">
        <label className="kgone-label" htmlFor="aire-simplification">{t('aire.simplification')}</label>
        <select id="aire-simplification" className="kgone-select" value={simplification} disabled={controlsDisabled} onChange={e => setSimplification(e.target.value as AireSimplification)}>
          {AIRE_SIMPLIFICATION_LEVELS.map(level => <option key={level} value={level}>{t(`aire.simplification.${level}`)}</option>)}
        </select>
      </div>
      <div className="kgone-hint">{t('aire.simplificationHelp')}</div>
      <label className="humanize-checkbox-row">
        <input type="checkbox" checked={useVelocity} disabled={controlsDisabled} onChange={e => setUseVelocity(e.target.checked)} />
        <span>{t('aire.useVelocity')}</span>
      </label>
      <div className="kgone-hint">{t('aire.useVelocityHelp')}</div>
      {busy && <AireProgress percent={percent} text={progressText} />}
      {error && <p className="kgone-error-msg" role="alert">{error}</p>}

      <button ref={humanizeButton} className="dialog-btn dialog-btn-primary kgone-btn-generate" type="button"
        disabled={!target || controlsDisabled || !isActive} onClick={() => void humanize()}>{t('aire.humanize')}</button>
      {!target && <p className="kgone-separator-hint">{t('aire.noTarget')}</p>}
      {busy && <button className="kgone-btn-secondary" type="button" onClick={cancel}>{t('dialog.cancel')}</button>}
    </div>
    {confirmReplacement && createPortal(<div className="dialog-overlay aire-replacement-overlay" onMouseDown={() => setConfirmReplacement(false)}>
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
    </div>, document.body)}
  </>;
}
