import React, { useSyncExternalStore } from 'react';
import './StatusBar.css';
import { useProjectStore } from '../stores/projectStore';
import { KGPianoRollState } from '../core/state/KGPianoRollState';
import type { ResolvedChordGuideItem } from '../core/ChordGuideTypes';

function formatChordGuideCandidateStatus(candidate: ResolvedChordGuideItem): string {
  return `Chord Guide Candidate: ${candidate.name} — ${candidate.resolvedNotes.join(' ')} — ${candidate.note}`;
}

const StatusBar: React.FC = () => {
  const { currentStatus } = useProjectStore();
  const hoveredChordGuideCandidate = useSyncExternalStore(
    (listener) => KGPianoRollState.instance().subscribe(listener),
    () => KGPianoRollState.instance().getCurrentHoveredChordGuideCandidate(),
    () => null,
  );
  const statusText = hoveredChordGuideCandidate
    ? formatChordGuideCandidateStatus(hoveredChordGuideCandidate)
    : currentStatus;

  return (
    <div className="status-bar">
      <div className="status-left" title={statusText}>
        {statusText}
      </div>
      <div className="status-right">
        <span>K.G.Studio (v{__APP_VERSION__})</span>
      </div>
    </div>
  );
};

export default StatusBar; 
export { formatChordGuideCandidateStatus };
