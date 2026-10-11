import DynamicsHistory from './DynamicsHistory';
import type { LimiterVisualConfig } from '../../core/config/limiterVisualConfig';

export default function LimiterHistory(props: {
  trackId?: string; effectId?: number; active: boolean; settings: LimiterVisualConfig;
}) {
  return <DynamicsHistory {...props} kind="limiter" />;
}
