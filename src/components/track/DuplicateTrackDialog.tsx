import React from 'react';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';
import type { DuplicateTrackOptions } from '../../core/commands';
import { useI18n } from '../../i18n/useI18n';
import '../common/DialogProvider.css';

interface DuplicateTrackDialogProps {
  isOpen: boolean;
  hasRegions: boolean;
  onConfirm: (options: DuplicateTrackOptions) => void; // eslint-disable-line no-unused-vars
  onCancel: () => void;
}

const DEFAULT_OPTIONS: DuplicateTrackOptions = {
  includeAutomation: false,
  includeRegions: false,
};

const DuplicateTrackDialog: React.FC<DuplicateTrackDialogProps> = ({
  isOpen,
  hasRegions,
  onConfirm,
  onCancel,
}) => {
  const { t } = useI18n();
  const [options, setOptions] = React.useState<DuplicateTrackOptions>(DEFAULT_OPTIONS);

  React.useEffect(() => {
    if (!isOpen) return;
    setOptions(DEFAULT_OPTIONS);
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onCancel();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return createPortal(
    <div className="dialog-overlay" onMouseDown={onCancel}>
      <div
        className="dialog-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('track.duplicate.title')}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="dialog-header">
          <h3 className="dialog-title">{t('track.duplicate.title')}</h3>
          <button type="button" className="dialog-close-btn" onClick={onCancel} aria-label={t('dialog.close')}>
            <FaTimes />
          </button>
        </div>
        <div className="dialog-body">
          <p className="dialog-message">{t('track.duplicate.message')}</p>
          <div className="dialog-chord-detection-form">
            <label className="dialog-checkbox-row">
              <input type="checkbox" checked={true} disabled={true} readOnly={true} />
              <span>{t('track.duplicate.trackSettings')}</span>
            </label>
            <label className="dialog-checkbox-row">
              <input
                type="checkbox"
                checked={options.includeAutomation}
                onChange={event => setOptions(current => ({ ...current, includeAutomation: event.target.checked }))}
              />
              <span>{t('track.duplicate.automation')}</span>
            </label>
            <label className="dialog-checkbox-row">
              <input
                type="checkbox"
                checked={options.includeRegions}
                disabled={!hasRegions}
                onChange={event => setOptions(current => ({ ...current, includeRegions: event.target.checked }))}
              />
              <span>{t('track.duplicate.regions')}</span>
            </label>
            {!hasRegions && (
              <div className="dialog-hint-card">
                <div className="dialog-hint-card-text">{t('track.duplicate.noRegions')}</div>
              </div>
            )}
          </div>
        </div>
        <div className="dialog-footer">
          <button type="button" className="dialog-btn dialog-btn-cancel" onClick={onCancel}>
            {t('track.duplicate.cancel')}
          </button>
          <button type="button" className="dialog-btn dialog-btn-primary" onClick={() => onConfirm(options)} autoFocus>
            {t('track.duplicate.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default DuplicateTrackDialog;
