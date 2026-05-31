import React, { useSyncExternalStore } from 'react';
import './StatusBar.css';
import { useProjectStore } from '../stores/projectStore';
import { KGPianoRollState } from '../core/state/KGPianoRollState';
import type { ResolvedChordGuideItem } from '../core/ChordGuideTypes';
import { translate } from '../i18n/translate';

function formatChordGuideCandidateStatus(candidate: ResolvedChordGuideItem): string {
  return translate('status.chordGuideCandidate', {
    name: candidate.name,
    notes: candidate.resolvedNotes.join(' '),
    note: candidate.note,
  });
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
