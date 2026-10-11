import { useEffect, useRef } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';
import type { LimiterLevel, LimiterMonitor } from '../../core/audio-interface/limiterPeakMonitor';
import type { LimiterVisualConfig } from '../../core/config/limiterVisualConfig';
import { limiterHistoryPath, reductionHistoryPath } from './limiterHistoryPath';

export default function DynamicsHistory({ trackId, effectId, active, settings, kind }: {
  kind: 'limiter' | 'compressor';
  trackId?: string; effectId?: number; active: boolean; settings: LimiterVisualConfig & { reductionRangeDb?: number };
}) {
  const { t } = useI18n();
  const path = useRef<SVGPathElement>(null);
  const reductionPath = useRef<SVGPathElement>(null);
  const reduction = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    if (!active || trackId === undefined || effectId === undefined) return;
    let cancelled = false;
    let monitor: LimiterMonitor | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const history: LimiterLevel[] = [];
    const clear = () => {
      path.current?.removeAttribute('d');
      reductionPath.current?.removeAttribute('d');
      if (reduction.current) reduction.current.textContent = '0.0 dB';
      history.length = 0;
    };
    const onLevel = (level: LimiterLevel) => {
      if (cancelled) return;
      history.push(level);
      while (history.length > Math.ceil(settings.fps * settings.historySeconds) + 2
        || (history.length > 2 && history[1].time <= level.time - settings.historySeconds)) history.shift();
      path.current?.setAttribute('d', limiterHistoryPath(history, settings));
      if (settings.reductionRangeDb) reductionPath.current?.setAttribute('d', reductionHistoryPath(history, settings.historySeconds, settings.reductionRangeDb));
      if (reduction.current) reduction.current.textContent = `${Math.abs(level.reductionDb).toFixed(1)} dB`;
    };
    let generation = 0;
    const stop = () => {
      generation++;
      clearTimeout(timer);
      monitor?.dispose();
      monitor = null;
      clear();
    };
    const open = async () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      const version = generation;
      try {
        const audio = KGAudioInterface.instance();
        const next = await (kind === 'limiter' ? audio.openLimiterMonitor(trackId, effectId, settings.fps, onLevel)
          : audio.openCompressorMonitor(trackId, effectId, settings.fps, onLevel));
        if (cancelled || version !== generation) { next?.dispose(); return; }
        monitor = next;
        timer = setTimeout(check, 1000 / settings.fps);
      } catch (error) {
        if (cancelled || version !== generation) return;
        console.error(`${kind} visualization unavailable:`, error);
        if (reduction.current) reduction.current.textContent = '—';
      }
    };
    const check = () => {
      if (!monitor || monitor.closed) { clear(); void open(); }
      else timer = setTimeout(check, 1000 / settings.fps);
    };
    const visibility = () => { stop(); void open(); };
    document.addEventListener('visibilitychange', visibility);
    void open();
    return () => { cancelled = true; stop(); document.removeEventListener('visibilitychange', visibility); };
  }, [active, trackId, effectId, settings, kind]);
  return <>
    <svg className={`limiter-history ${kind}-history`} viewBox="0 0 600 110" preserveAspectRatio="none" aria-hidden="true">
      <path ref={path} />
      {settings.reductionRangeDb && <path ref={reductionPath} className="dynamics-reduction-history" />}
    </svg>
    <span className="limiter-reduction">{t(`fx.${kind}.reduction`)} <output ref={reduction}>0.0 dB</output></span>
  </>;
}
