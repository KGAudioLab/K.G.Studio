import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaMusic, FaTimes } from 'react-icons/fa';
import { FaWaveSquare } from 'react-icons/fa6';
import './DialogProvider.css';
import './TrackCreateDialog.css';

type TrackCreateDialogResult = 'cancel' | 'midi' | 'audio';

interface TrackCreateDialogProps {
  onResolve: (result: TrackCreateDialogResult) => void;
}

const TrackCreateDialog: React.FC<TrackCreateDialogProps> = ({ onResolve }) => {
  const [selectedTrackType, setSelectedTrackType] = useState<'midi' | 'audio'>('midi');
  const [isClosing, setIsClosing] = useState(false);
  const pendingResultRef = useRef<TrackCreateDialogResult>('cancel');
  const mouseDownOnOverlay = useRef(false);

  const close = useCallback((result: TrackCreateDialogResult) => {
    pendingResultRef.current = result;
    setIsClosing(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close('cancel');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [close]);

  const handleAnimationEnd = useCallback((e: React.AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (!isClosing) return;
    onResolve(pendingResultRef.current);
  }, [isClosing, onResolve]);

  return createPortal(
    <div
      className={`dialog-overlay${isClosing ? ' dialog-overlay-closing' : ''}`}
      onMouseDown={(e) => {
        mouseDownOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownOnOverlay.current) {
          close('cancel');
        }
      }}
      onAnimationEnd={handleAnimationEnd}
    >
      <div
        className={`dialog-modal track-create-dialog-modal${isClosing ? ' dialog-modal-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="track-create-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h3 id="track-create-title" className="dialog-title">Create New Track</h3>
          <button
            className="dialog-close-btn"
            onClick={() => close('cancel')}
            aria-label="Close dialog"
          >
            <FaTimes />
          </button>
        </div>
        <div className="dialog-body track-create-dialog-body">
          <button
            type="button"
            className={`track-create-option${selectedTrackType === 'midi' ? ' selected' : ''}`}
            onClick={() => setSelectedTrackType('midi')}
          >
            <div className="track-create-option-icon midi">
              <FaMusic />
            </div>
            <span className="track-create-option-label">MIDI</span>
          </button>
          <button
            type="button"
            className={`track-create-option${selectedTrackType === 'audio' ? ' selected' : ''}`}
            onClick={() => setSelectedTrackType('audio')}
          >
            <div className="track-create-option-icon audio">
              <FaWaveSquare />
            </div>
            <span className="track-create-option-label">Audio</span>
          </button>
        </div>
        <div className="dialog-footer">
          <button
            type="button"
            className="dialog-btn dialog-btn-cancel"
            onClick={() => close('cancel')}
          >
            Cancel
          </button>
          <button
            type="button"
            className="dialog-btn dialog-btn-primary"
            onClick={() => close(selectedTrackType)}
          >
            Create
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TrackCreateDialog;
