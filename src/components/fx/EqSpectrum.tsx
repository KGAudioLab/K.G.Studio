import { useEffect, useRef } from 'react';
import { ConfigManager } from '../../core/config/ConfigManager';
import { getEQVisualConfig } from '../../core/config/eqVisualConfig';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';
import type { EQSpectrumReader } from '../../core/audio-interface/KGTrackFXChain';
import { eqSpectrumPath } from './eqSpectrumPath';

export default function EqSpectrum({ trackId, effectId, active, width, height }: {
  trackId?: string; effectId?: number; active: boolean; width: number; height: number;
}) {
  const path = useRef<SVGPathElement>(null);
  useEffect(() => {
    if (!active || trackId === undefined || effectId === undefined) return;
    let reader: EQSpectrumReader | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settings = getEQVisualConfig();
    const clear = () => path.current?.removeAttribute('d');
    const stop = () => {
      clearTimeout(timer);
      reader?.dispose();
      reader = null;
      clear();
    };
    const tick = () => {
      if (document.visibilityState === 'hidden') { stop(); return; }
      reader ??= KGAudioInterface.instance().openEQSpectrum(trackId, effectId, settings.fftSize);
      const data = reader?.read();
      if (data && path.current) path.current.setAttribute('d', eqSpectrumPath(data, reader!.sampleRate, width, height));
      else { reader?.dispose(); reader = null; clear(); }
      timer = setTimeout(tick, 1000 / settings.fps);
    };
    const restart = () => { stop(); settings = getEQVisualConfig(); tick(); };
    const unsubscribe = ConfigManager.instance().addChangeListener(keys => {
      if (keys.some(key => 'audio.fx_visual.eq'.startsWith(key) || key.startsWith('audio.fx_visual.eq.'))) restart();
    });
    document.addEventListener('visibilitychange', restart);
    tick();
    return () => { stop(); unsubscribe(); document.removeEventListener('visibilitychange', restart); };
  }, [active, trackId, effectId, width, height]);
  return <path ref={path} className="eq-spectrum" aria-hidden="true" />;
}
