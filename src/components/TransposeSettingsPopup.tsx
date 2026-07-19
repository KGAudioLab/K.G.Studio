import React from 'react';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';
import type { MidiTransposeSettings } from '../core/track/KGMidiTrack';
import { MAX_TRANSPOSE, MIN_TRANSPOSE } from '../util/midiTransposeUtil';
import { useI18n } from '../i18n/useI18n';
import './common/DialogProvider.css';

interface TransposeSettingsPopupProps {
  isOpen: boolean;
  settings: MidiTransposeSettings;
  noTranspose: boolean;
  showNoTranspose: boolean;
  inherit?: boolean;
  // eslint-disable-next-line no-unused-vars
  onConfirm: (result: { settings: MidiTransposeSettings; noTranspose: boolean; inherit: boolean }) => void;
  onCancel: () => void;
}

const TRANSPOSE_OPTIONS = Array.from(
  { length: MAX_TRANSPOSE - MIN_TRANSPOSE + 1 },
  (_, index) => MAX_TRANSPOSE - index,
);

const TransposeSettingsPopup: React.FC<TransposeSettingsPopupProps> = ({
  isOpen,
  settings,
  noTranspose,
  showNoTranspose,
  inherit = false,
  onConfirm,
  onCancel,
}) => {
  const { t } = useI18n();
  const [draftSettings, setDraftSettings] = React.useState(settings);
  const [draftNoTranspose, setDraftNoTranspose] = React.useState(noTranspose);
  const [draftInherit, setDraftInherit] = React.useState(inherit);
  const initialFollowKeySignature = settings.followKeySignature;
  const initialTranspose = settings.transpose;

  React.useEffect(() => {
    if (!isOpen) return;
    setDraftSettings({ followKeySignature: initialFollowKeySignature, transpose: initialTranspose });
    setDraftNoTranspose(noTranspose);
    setDraftInherit(inherit);
  }, [inherit, initialFollowKeySignature, initialTranspose, isOpen, noTranspose]);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onCancel();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;
  const controlsDisabled = draftNoTranspose || (!showNoTranspose && draftInherit);

  return createPortal(
    <div className="dialog-overlay transpose-popup-backdrop" onMouseDown={onCancel}>
      <div
        className="dialog-modal transpose-popup"
        role="dialog"
        aria-modal="true"
        aria-label={t('transpose.title')}
        onMouseDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
        onDoubleClick={event => event.stopPropagation()}
      >
        <div className="dialog-header">
          <h3 className="dialog-title">{t('transpose.title')}</h3>
          <button
            type="button"
            className="dialog-close-btn"
            onClick={onCancel}
            aria-label={t('dialog.close')}
          >
            <FaTimes />
          </button>
        </div>
        <div className="dialog-body">
          <div className="dialog-chord-detection-form">
            {!showNoTranspose && (
              <label className="dialog-checkbox-row">
                <input
                  type="checkbox"
                  checked={draftInherit}
                  disabled={draftNoTranspose}
                  onChange={event => setDraftInherit(event.target.checked)}
                />
                <span>{t('transpose.inheritTrack')}</span>
              </label>
            )}
            <label className="dialog-checkbox-row">
              <input
                type="checkbox"
                checked={draftSettings.followKeySignature}
                disabled={controlsDisabled}
                onChange={event => setDraftSettings(current => ({ ...current, followKeySignature: event.target.checked }))}
              />
              <span>{t('transpose.followKeySignature')}</span>
            </label>
            <div className="dialog-slider-group">
              <div className="dialog-slider-header">
                <label className="dialog-slider-label" htmlFor="transpose-value-select">{t('transpose.transpose')}</label>
              </div>
              <select
                id="transpose-value-select"
                className="dialog-input dialog-compact-input settings-select"
                value={draftSettings.transpose}
                disabled={controlsDisabled}
                onChange={event => setDraftSettings(current => ({ ...current, transpose: Number(event.target.value) }))}
              >
                {TRANSPOSE_OPTIONS.map(value => (
                  <option key={value} value={value}>{value >= 0 ? `+${value}` : value}</option>
                ))}
              </select>
            </div>
            {showNoTranspose && (
              <label className="dialog-checkbox-row">
                <input
                  type="checkbox"
                  checked={draftNoTranspose}
                  onChange={event => setDraftNoTranspose(event.target.checked)}
                />
                <span>{t('transpose.noTranspose')}</span>
              </label>
            )}
          </div>
        </div>
        <div className="dialog-footer">
          <button type="button" className="dialog-btn dialog-btn-cancel" onClick={onCancel}>{t('transpose.cancel')}</button>
          <button
            type="button"
            className="dialog-btn dialog-btn-primary"
            onClick={() => onConfirm({ settings: draftSettings, noTranspose: draftNoTranspose, inherit: draftInherit })}
          >
            {t('transpose.ok')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TransposeSettingsPopup;
