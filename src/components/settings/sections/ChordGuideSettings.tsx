import React, { useState, useEffect, useCallback } from 'react';
import { ConfigManager } from '../../../core/config/ConfigManager';
import { validateFunctionalChordsJSON } from '../../../util/scaleUtil';
import { KGCore } from '../../../core/KGCore';

const ChordGuideSettings: React.FC = () => {
  const [chordDefinition, setChordDefinition] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const configManager = ConfigManager.instance();

  // Load configuration values on component mount
  useEffect(() => {
    const loadConfig = async () => {
      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }

      setChordDefinition((configManager.get('chord_guide.chord_definition') as string) || '');
    };

    loadConfig();
  }, [configManager]);

  // Debounced save function for textarea
  const debouncedSave = useCallback((value: string) => {
    const timeoutId = setTimeout(async () => {
      try {
        await configManager.set('chord_guide.chord_definition', value);
        console.log('Chord definition saved');
      } catch (error) {
        console.error('Failed to save chord definition:', error);
      }
    }, 1000); // 1 second debounce for longer text

    return () => clearTimeout(timeoutId);
  }, [configManager]);

  // Save configuration when value changes
  const handleChordDefinitionChange = (value: string) => {
    setChordDefinition(value);

    // Validate the JSON
    if (value.trim()) {
      const validationResult = validateFunctionalChordsJSON(value);
      setValidationErrors(validationResult.valid ? [] : validationResult.errors);

      // Update FUNCTIONAL_CHORDS_DATA if valid and non-empty
      if (validationResult.valid) {
        try {
          KGCore.FUNCTIONAL_CHORDS_DATA = JSON.parse(value);
          console.log('Applied custom chord definition');
        } catch (error) {
          console.error('Failed to parse chord definition:', error);
          KGCore.FUNCTIONAL_CHORDS_DATA = KGCore.ORIGINAL_FUNCTIONAL_CHORDS_DATA;
        }
      } else {
        // Revert to original if invalid
        KGCore.FUNCTIONAL_CHORDS_DATA = KGCore.ORIGINAL_FUNCTIONAL_CHORDS_DATA;
        console.log('Invalid chord definition, reverted to original');
      }
    } else {
      setValidationErrors([]);
      // Revert to original if empty
      KGCore.FUNCTIONAL_CHORDS_DATA = KGCore.ORIGINAL_FUNCTIONAL_CHORDS_DATA;
      console.log('Chord definition cleared, reverted to original');
    }

    debouncedSave(value);
  };

  // Load default template from functional_chords.json (preserving original formatting)
  const handleLoadDefaultTemplate = async () => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}resources/modes/functional_chords.json`);
      if (!response.ok) {
        throw new Error(`Failed to fetch functional_chords.json: ${response.status}`);
      }
      // Get the raw text to preserve original formatting
      const rawText = await response.text();
      setChordDefinition(rawText);
      setValidationErrors([]); // Clear errors when loading valid template
      await configManager.set('chord_guide.chord_definition', rawText);

      // Revert to original if empty
      KGCore.FUNCTIONAL_CHORDS_DATA = KGCore.ORIGINAL_FUNCTIONAL_CHORDS_DATA;

      console.log('Loaded default chord template');
    } catch (error) {
      console.error('Failed to load default template:', error);
      alert('Failed to load default template. Please check the console for details.');
    }
  };

  // Clear the chord definition
  const handleClear = async () => {
    setChordDefinition('');
    setValidationErrors([]); // Clear errors when clearing
    await configManager.set('chord_guide.chord_definition', '');

    // Revert to original if empty
    KGCore.FUNCTIONAL_CHORDS_DATA = KGCore.ORIGINAL_FUNCTIONAL_CHORDS_DATA;
    
    console.log('Chord definition cleared');
  };

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h3>Chord Guide</h3>
      </div>

      <div className="settings-section-content">
        <div className="settings-group">
          <h4>Chord Definition</h4>
          <div className="settings-help-links">
            <button
              className="settings-help"
              onClick={handleLoadDefaultTemplate}
            >
              Load Default Template
            </button>
            <button
              className="settings-help"
              onClick={handleClear}
            >
              Clear
            </button>
          </div>

          <div className="settings-item">
            <textarea
              className="settings-textarea"
              placeholder="Please input your chord definitions"
              rows={8}
              value={chordDefinition}
              onChange={(e) => handleChordDefinitionChange(e.target.value)}
            />
            {validationErrors.length > 0 && (
              <div className="settings-validation-errors">
                {validationErrors.map((error, index) => (
                  <div key={index} className="settings-validation-error">
                    {error}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChordGuideSettings;
