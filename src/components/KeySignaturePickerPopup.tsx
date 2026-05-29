import React from 'react';
import type { KeySignature } from '../core/KGProject';
import { buildKeySignatureCircleSlots } from './keySignaturePickerLayout';
import './KeySignaturePickerPopup.css';

interface KeySignaturePickerPopupProps {
  value: KeySignature;
  // Keep the callback typed to project key signatures without duplicating the union locally.
  // eslint-disable-next-line no-unused-vars
  onChange: (keySignature: KeySignature) => void;
}

const OUTER_RADIUS = 87;
const INNER_RADIUS = 55;
const COUNT_RADIUS = 69;
const CENTER_X = 126;
const CENTER_Y = 112;

function getPosition(angleDeg: number, radius: number) {
  const angle = (angleDeg * Math.PI) / 180;
  return {
    left: CENTER_X + radius * Math.cos(angle),
    top: CENTER_Y + radius * Math.sin(angle),
  };
}

function splitAccidental(label: string): { base: string; accidental: string | null } {
  if (label.includes('#')) {
    return { base: label.replace('#', ''), accidental: '♯' };
  }
  if (label.includes('b')) {
    return { base: label.replace('b', ''), accidental: '♭' };
  }
  return { base: label, accidental: null };
}

const KeyLabel: React.FC<{ label: string; selected?: boolean }> = ({ label, selected = false }) => {
  const { base, accidental } = splitAccidental(label);
  return (
    <span className={`key-signature-picker-label ${selected ? 'selected' : ''}`.trim()}>
      <span>{base}</span>
      {accidental && <sup className="key-signature-picker-accidental">{accidental}</sup>}
    </span>
  );
};

const CombinedKeyLabel: React.FC<{ labels: string[]; selectedIndex?: number }> = ({ labels, selectedIndex = -1 }) => (
  <span className="key-signature-picker-label">
    {labels.map((label, index) => (
      <React.Fragment key={label}>
        <KeyLabel label={label} selected={index === selectedIndex} />
        {index < labels.length - 1 && <span className="key-signature-picker-divider">/</span>}
      </React.Fragment>
    ))}
  </span>
);

const KeySignaturePickerPopup: React.FC<KeySignaturePickerPopupProps> = ({ value, onChange }) => {
  const slots = React.useMemo(() => buildKeySignatureCircleSlots(), []);

  const handlePairedSelection = React.useCallback((keySignatures: KeySignature[]) => {
    if (keySignatures.length === 0) {
      return;
    }

    const activeIndex = keySignatures.indexOf(value);
    if (activeIndex >= 0) {
      onChange(keySignatures[(activeIndex + 1) % keySignatures.length]);
      return;
    }

    onChange(keySignatures[0]);
  }, [onChange, value]);

  return (
    <div className="key-signature-popup">
      <div className="key-signature-picker">
        <div className="key-signature-picker-ring" aria-hidden="true" />
        <h3 className="key-signature-picker-title major">Major</h3>
        <h3 className="key-signature-picker-title minor">Minor</h3>
        {slots.map((slot) => {
          const outerPosition = getPosition(slot.angleDeg, OUTER_RADIUS);
          const innerPosition = getPosition(slot.angleDeg, INNER_RADIUS);
          const countPosition = getPosition(slot.angleDeg, COUNT_RADIUS);

          return (
            <React.Fragment key={slot.id}>
              <div
                className="key-signature-picker-slot key-signature-picker-slot-outer"
                style={outerPosition}
              >
                {slot.outerItems.length > 1 ? (
                  <button
                    type="button"
                    className={`key-signature-picker-button key-signature-picker-button-paired major ${slot.outerItems.some(item => item.keySignature === value) ? 'selected' : ''}`.trim()}
                    onClick={() => handlePairedSelection(slot.outerItems.map(item => item.keySignature))}
                    aria-label={`Select ${slot.outerItems.map(item => item.keySignature).join(' or ')}`}
                    title={slot.outerItems.map(item => item.keySignature).join(' / ')}
                  >
                    <CombinedKeyLabel
                      labels={slot.outerItems.map(item => item.label)}
                      selectedIndex={slot.outerItems.findIndex(item => item.keySignature === value)}
                    />
                  </button>
                ) : (
                  <div className="key-signature-picker-item-stack">
                    {slot.outerItems.map((item) => (
                      <div className="key-signature-picker-key" key={item.keySignature}>
                        <button
                          type="button"
                        className={`key-signature-picker-button major ${value === item.keySignature ? 'selected' : ''}`.trim()}
                        onClick={() => onChange(item.keySignature)}
                        aria-label={`Select ${item.keySignature}`}
                      >
                          <KeyLabel label={item.label} selected={value === item.keySignature} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div
                className="key-signature-picker-slot key-signature-picker-slot-inner"
                style={innerPosition}
              >
                {slot.innerItems.length > 1 ? (
                  <button
                    type="button"
                    className={`key-signature-picker-button key-signature-picker-button-paired minor ${slot.innerItems.some(item => item.keySignature === value) ? 'selected' : ''}`.trim()}
                    onClick={() => handlePairedSelection(slot.innerItems.map(item => item.keySignature))}
                    aria-label={`Select ${slot.innerItems.map(item => item.keySignature).join(' or ')}`}
                    title={slot.innerItems.map(item => item.keySignature).join(' / ')}
                  >
                    <CombinedKeyLabel
                      labels={slot.innerItems.map(item => item.label)}
                      selectedIndex={slot.innerItems.findIndex(item => item.keySignature === value)}
                    />
                  </button>
                ) : (
                  <div className="key-signature-picker-item-stack">
                    {slot.innerItems.map((item) => (
                      <button
                        type="button"
                        key={item.keySignature}
                        className={`key-signature-picker-button minor ${value === item.keySignature ? 'selected' : ''}`.trim()}
                        onClick={() => onChange(item.keySignature)}
                        aria-label={`Select ${item.keySignature}`}
                      >
                        <KeyLabel label={item.label} selected={value === item.keySignature} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div
                className="key-signature-picker-slot key-signature-picker-slot-count"
                style={countPosition}
                aria-hidden="true"
              >
                {slot.accidentalLabel}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default KeySignaturePickerPopup;
