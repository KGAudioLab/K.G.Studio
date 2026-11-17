import { useEffect } from 'react';
import { useStore } from 'zustand';
import { useI18n } from '../i18n/useI18n';
import { useProjectStore } from '../stores/projectStore';
import { INSTVELA_INSTRUMENTS } from '../util/instvela/instruments';
import { INSTVELA_BUNDLES, INSTVELA_MODEL_PAGE } from '../util/instvela/modelAssets';
import { ensureInstVelaModels, instVelaModels, refreshInstVelaModels } from '../util/instvela/models';
import { instVelaRenderer } from '../util/instvela/renderer';
import { pitchToNoteNameString } from '../util/midiUtil';
import AireProgress from './AireProgress';

// The fourth keyswitch is reserved for future tremolo support.
const KEYSWITCH_COLUMNS = ['sustain', 'spiccato', 'pizzicato'] as const;

export default function AiStringsTab({ isActive }: { isActive: boolean }) {
  const { t } = useI18n();
  const autoRender = useProjectStore(state => state.instVelaAutoRender);
  const setAutoRender = useProjectStore(state => state.setInstVelaAutoRender);
  const models = useStore(instVelaModels);
  const queue = useStore(instVelaRenderer.state, state => state.queue);
  const provider = useStore(instVelaRenderer.state, state => state.provider);
  const rendering = queue.some(row => row.status === 'rendering');
  const ready = models.cached === INSTVELA_BUNDLES.length;
  const downloading = models.activity === 'downloading';
  useEffect(() => {
    if (isActive) void refreshInstVelaModels().catch(() => {});
  }, [isActive]);

  const downloadText = t('instvela.downloading', { percent: models.percent });
  const providerName = provider === 'webgpu' ? 'WebGPU' : provider === 'wasm' ? 'CPU/WASM'
    : t(rendering ? 'instvela.providerPreparing' : 'instvela.providerIdle');
  const providerText = provider && !rendering
    ? t('instvela.providerLast', { provider: providerName })
    : t('kgone.separator.local.provider') + providerName;
  return (
    <div className="humanize-form kgone-tab-content">
      <div className="kgone-local-mode-card">
        <div className="kgone-local-mode-title">{t('instvela.cardTitle')}</div>
        <div className="instvela-card-body">
          <a href={INSTVELA_MODEL_PAGE} target="_blank" rel="noopener noreferrer" aria-label={t('instvela.modelPage')}>
            <img src={`${import.meta.env.BASE_URL}resources/instvela-logo.png`} alt="" width={64} height={64} />
          </a>
          <div className="instvela-card-copy kgone-local-mode-text">
            <div>{t('instvela.description')}</div>
            <div aria-live="polite">{t('instvela.cached', { count: models.cached })}</div>
          </div>
        </div>
        <div className="kgone-runtime-row">
          <div className="kgone-provider-chip" aria-live="polite">{providerText}</div>
        </div>
        {!ready && <div className="kgone-row">
          <button type="button" className="kgone-btn-secondary" disabled={models.activity !== 'idle'}
            onClick={() => void ensureInstVelaModels().catch(() => {})}>
            {t('instvela.downloadModels')}
          </button>
        </div>}
        {downloading && <AireProgress percent={models.percent} text={downloadText} />}
        {models.error && <p className="kgone-error-msg" role="alert">{t('aire.modelFailed', { error: models.error })}</p>}
      </div>
      <section className="instvela-keyswitches" aria-labelledby="instvela-keyswitches-title">
        <div className="instvela-keyswitches-scroll">
          <table className="instvela-keyswitches-table" aria-describedby="instvela-keyswitches-help">
            <caption id="instvela-keyswitches-title">{t('instvela.keyswitches.title')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('instvela.keyswitches.instrument')}</th>
                {KEYSWITCH_COLUMNS.map(articulation => (
                  <th key={articulation} scope="col">{t(`pianoRoll.articulation.${articulation}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(INSTVELA_INSTRUMENTS).map(([id, instrument]) => (
                <tr key={id}>
                  <th scope="row">{t(instrument.preview === 'contrabass'
                    ? 'instvela.keyswitches.doubleBass' : `instrument.name.${instrument.preview}`)}</th>
                  {KEYSWITCH_COLUMNS.map((articulation, offset) => {
                    const pitch = instrument.keyswitch + offset;
                    return (
                      <td key={articulation}>
                        <span className="instvela-keyswitch-note">
                          {pitchToNoteNameString(pitch)} <span className="instvela-keyswitch-number">({pitch})</span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="kgone-hint" id="instvela-keyswitches-help">{t('instvela.keyswitches.help')}</p>
      </section>
      <label className="humanize-checkbox-row">
        <input type="checkbox" checked={autoRender} aria-describedby="instvela-auto-render-help"
          onChange={event => setAutoRender(event.target.checked)} />
        {t('instvela.autoRender')}
      </label>
      <div className="kgone-hint" id="instvela-auto-render-help">{t('instvela.autoRenderHelp')}</div>
      <section className="instvela-queue" aria-label={t('instvela.queue')}>
        <h4>{t('instvela.queue')}</h4>
        {queue.length === 0 ? <p className="kgone-local-mode-text">{t('instvela.queueEmpty')}</p> :
          <ul>
            {queue.map((row, index) => {
              const progress = row.progress;
              const label = progress ? t('instvela.stageProgress', {
                stage: t(`instvela.stage.${progress.stage}`),
                completed: progress.completed,
                total: progress.total,
              }) : t(`instvela.${row.status}`);
              return (
                <li key={`${row.id}-${index}`} className="kgone-region-info">
                  <div className="kgone-region-info-value">{row.name}</div>
                  <div className="kgone-region-info-label">{row.trackName}</div>
                  {row.status === 'failed' && <p className="kgone-error-msg" role="alert">{row.error}</p>}
                  {row.status === 'queued' && <div className="kgone-local-mode-text">{label}</div>}
                  {row.status === 'rendering' && <AireProgress percent={progress?.percent ?? null} text={label} />}
                </li>
              );
            })}
          </ul>}
      </section>
    </div>
  );
}
