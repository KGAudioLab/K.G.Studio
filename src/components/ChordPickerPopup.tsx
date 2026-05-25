import React from 'react';
import './ChordPickerPopup.css';
import KGDropdown from './common/KGDropdown';
import {
  buildChordSymbol,
  CHORD_EXTENSION_OPTIONS,
  formatChordSymbolForDisplay,
  type ChordDescriptor,
  type ChordExtension,
  type ChordQuality,
  parseChordSymbol,
} from '../util/chordUtil';

interface ChordPickerPopupProps {
  value: string;
  onChange: (symbol: string) => void;
  onTabNavigate?: (direction: 'forward' | 'backward') => void;
}

const ROOT_OPTIONS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'] as const;

const QUALITY_LABELS: Record<ChordQuality, string> = {
  maj: 'Maj',
  min: 'Min',
  sus2: 'Sus2',
  sus4: 'Sus4',
  power: '5',
  aug: 'Aug',
  dim: 'Dim',
};

const EXTENSION_LABELS: Record<ChordExtension, string> = {
  b5: 'b5',
  '#5': '#5',
  '6': '6',
  '7': '7',
  maj7: 'maj7',
  b9: 'b9',
  '9': '9',
  '#9': '#9',
  '11': '11',
  '#11': '#11',
  b13: 'b13',
  '13': '13',
};

const QUALITY_ROWS: ChordQuality[][] = [
  ['maj', 'min', 'sus2', 'sus4'],
  ['power', 'aug', 'dim'],
];

const EXTENSION_ROWS: ChordExtension[][] = [
  ['b5', '#5', '6', '7'],
  ['maj7', 'b9', '9', '#9'],
  ['11', '#11', 'b13', '13'],
];

function createFallbackDescriptor(value: string): ChordDescriptor {
  return {
    root: 'C',
    quality: 'maj',
    extensions: [],
    symbol: value || 'C',
  };
}

function normalizeDescriptor(descriptor: ChordDescriptor): ChordDescriptor {
  let quality = descriptor.quality;
  let extensions = [...descriptor.extensions];

  const dedupe = (nextExtensions: ChordExtension[]) => Array.from(new Set(nextExtensions));
  const removeExtensions = (targets: ChordExtension[]) => {
    extensions = extensions.filter(extension => !targets.includes(extension));
  };

  if (quality === 'aug' && !extensions.includes('#5')) {
    extensions.push('#5');
  }
  if (quality === 'dim' && !extensions.includes('b5')) {
    extensions.push('b5');
  }
  if (quality === 'aug') {
    removeExtensions(['b5']);
  }
  if (quality === 'dim') {
    removeExtensions(['#5']);
  }
  if (extensions.includes('7')) {
    removeExtensions(['maj7', '6']);
  }
  if (extensions.includes('maj7')) {
    removeExtensions(['7', '6']);
  }
  if (extensions.includes('6')) {
    removeExtensions(['7', 'maj7', '13', 'b13']);
  }
  if (extensions.includes('13') || extensions.includes('b13')) {
    removeExtensions(['6']);
  }

  if (extensions.includes('b9')) {
    removeExtensions(['9', '#9']);
  } else if (extensions.includes('9')) {
    removeExtensions(['b9', '#9']);
  } else if (extensions.includes('#9')) {
    removeExtensions(['b9', '9']);
  }

  if (extensions.includes('11')) {
    removeExtensions(['#11']);
  } else if (extensions.includes('#11')) {
    removeExtensions(['11']);
  }

  if (extensions.includes('b13')) {
    removeExtensions(['13']);
  } else if (extensions.includes('13')) {
    removeExtensions(['b13']);
  }

  return {
    ...descriptor,
    quality,
    extensions: CHORD_EXTENSION_OPTIONS.filter(extension => dedupe(extensions).includes(extension)),
  };
}

const ChordPickerPopup: React.FC<ChordPickerPopupProps> = ({ value, onChange, onTabNavigate }) => {
  const [descriptor, setDescriptor] = React.useState<ChordDescriptor>(() => parseChordSymbol(value) ?? createFallbackDescriptor(value));
  const [inputText, setInputText] = React.useState(value);
  const [error, setError] = React.useState<string | null>(null);
  const [showRootDropdown, setShowRootDropdown] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const parsed = parseChordSymbol(value);
    setDescriptor(parsed ?? createFallbackDescriptor(value));
    setInputText(value);
    setError(null);
    setShowRootDropdown(false);
  }, [value]);

  React.useEffect(() => {
    if (!inputRef.current) {
      return;
    }

    inputRef.current.focus();
    inputRef.current.select();
  }, [value]);

  const applyDescriptor = React.useCallback((nextDescriptor: ChordDescriptor) => {
    const normalized = normalizeDescriptor(nextDescriptor);
    const nextSymbol = buildChordSymbol(normalized);
    if (!nextSymbol) {
      setError('Unsupported chord combination');
      return;
    }

    const parsed = parseChordSymbol(nextSymbol);
    if (!parsed) {
      setError('Unsupported chord combination');
      return;
    }

    setDescriptor(parsed);
    setInputText(parsed.symbol);
    setError(null);
    onChange(parsed.symbol);
  }, [onChange]);

  const handleQualityChange = React.useCallback((quality: ChordQuality) => {
    applyDescriptor({
      ...descriptor,
      quality,
    });
  }, [applyDescriptor, descriptor]);

  const handleExtensionToggle = React.useCallback((extension: ChordExtension) => {
    const isSelected = descriptor.extensions.includes(extension);
    const nextExtensions = isSelected
      ? descriptor.extensions.filter(candidate => candidate !== extension)
      : [...descriptor.extensions, extension];

    let nextQuality = descriptor.quality;
    if (!isSelected && extension === 'b5' && nextQuality === 'aug') {
      nextQuality = 'maj';
    }
    if (!isSelected && extension === '#5' && nextQuality === 'dim') {
      nextQuality = 'maj';
    }

    applyDescriptor({
      ...descriptor,
      quality: nextQuality,
      extensions: nextExtensions,
    });
  }, [applyDescriptor, descriptor]);

  const handleSubmit = React.useCallback(() => {
    const parsed = parseChordSymbol(inputText);
    if (!parsed) {
      setError('Unable to parse chord');
      return false;
    }

    setDescriptor(parsed);
    setInputText(parsed.symbol);
    setError(null);
    onChange(parsed.symbol);
    return true;
  }, [inputText, onChange]);

  return (
    <div
      className="chord-picker-popup"
      onKeyDownCapture={(event) => {
        if (event.key === 'Tab' && onTabNavigate) {
          event.preventDefault();
          event.stopPropagation();
          const isValid = handleSubmit();
          if (!isValid) {
            return;
          }

          onTabNavigate(event.shiftKey ? 'backward' : 'forward');
        }
      }}
    >
      <div className="chord-picker-header">
        <label className="chord-picker-input-shell">
          <span className="chord-picker-input-label">Chord</span>
          <input
            ref={inputRef}
            className={`chord-picker-input${error ? ' invalid' : ''}`}
            value={inputText}
            onChange={(event) => {
              setInputText(event.target.value);
              if (error) {
                setError(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleSubmit();
              }
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            placeholder="Type a chord"
          />
        </label>
      </div>

      <div className="chord-picker-section">
        <div className="chord-picker-section-header">
          <span>Root Note</span>
          <KGDropdown
            options={[...ROOT_OPTIONS]}
            value={descriptor.root}
            onChange={(nextRoot) => applyDescriptor({ ...descriptor, root: nextRoot })}
            label="Root Note"
            showValueAsLabel={true}
            isOpen={showRootDropdown}
            onToggle={setShowRootDropdown}
            buttonClassName="chord-picker-root-button"
            className="chord-picker-root-dropdown"
          />
        </div>
      </div>

      <div className="chord-picker-section chord-picker-grid">
        {QUALITY_ROWS.map((row, rowIndex) => (
          <div className="chord-picker-button-row" key={`quality-row-${rowIndex}`}>
            {row.map((quality) => (
              <button
                key={quality}
                type="button"
                aria-label={QUALITY_LABELS[quality]}
                className={`chord-picker-button quality${descriptor.quality === quality ? ' selected' : ''}`}
                onClick={() => handleQualityChange(quality)}
              >
                {QUALITY_LABELS[quality]}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="chord-picker-section chord-picker-grid">
        {EXTENSION_ROWS.map((row, rowIndex) => (
          <div className="chord-picker-button-row" key={`extension-row-${rowIndex}`}>
            {row.map((extension) => (
              <button
                key={extension}
                type="button"
                aria-label={EXTENSION_LABELS[extension]}
                className={`chord-picker-button extension${descriptor.extensions.includes(extension) ? ' selected' : ''}`}
                onClick={() => handleExtensionToggle(extension)}
              >
                {EXTENSION_LABELS[extension]}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="chord-picker-footer">
        <span className="chord-picker-preview">{formatChordSymbolForDisplay(descriptor.symbol || value)}</span>
        {error && <span className="chord-picker-error">{error}</span>}
      </div>
    </div>
  );
};

export default ChordPickerPopup;
