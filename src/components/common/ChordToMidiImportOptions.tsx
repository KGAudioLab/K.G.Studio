import React from 'react';
import type { ChordToMidiImportAction } from '../../util/dialogUtil';
import { useI18n } from '../../i18n/useI18n';

interface ChordToMidiImportOptionsProps {
  value: ChordToMidiImportAction;
  onChange: (value: ChordToMidiImportAction) => void;
}

const OPTIONS: Array<{ value: ChordToMidiImportAction; labelKey: string }> = [
  { value: 'create', labelKey: 'dialog.chordToMidi.createRegion' },
  { value: 'add', labelKey: 'dialog.chordToMidi.addToRegion' },
  { value: 'replace', labelKey: 'dialog.chordToMidi.replaceInRegion' },
];

const ChordToMidiImportOptions: React.FC<ChordToMidiImportOptionsProps> = ({ value, onChange }) => {
  const { t } = useI18n();

  return (
    <fieldset className="dialog-radio-group" aria-label={t('dialog.chordToMidi.methodLabel')}>
      {OPTIONS.map((option, index) => (
        <label className="dialog-radio-row" key={option.value}>
          <input
            type="radio"
            name="chord-to-midi-import-action"
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            autoFocus={index === 0}
          />
          <span>{t(option.labelKey)}</span>
        </label>
      ))}
    </fieldset>
  );
};

export default ChordToMidiImportOptions;
