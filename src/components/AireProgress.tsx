import './AireProgress.css';
export default function AireProgress({ percent, text }: { percent: number | null; text: string }) {
  return <div className="aire-progress-block" aria-live="polite">
    <div className="aire-progress-track" role="progressbar" aria-label={text} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={percent == null ? undefined : Math.max(0, Math.min(100, percent))}>
      <div className={`aire-progress-fill${percent == null ? ' aire-progress-indeterminate' : ''}`} style={percent == null ? undefined : { width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div><div className="settings-help">{text}</div>
  </div>;
}
