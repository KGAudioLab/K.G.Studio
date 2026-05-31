import React from 'react';
import { FaPlus, FaTrash } from 'react-icons/fa';
import '../../EventListPanel.css';
import { ConfigManager } from '../../../core/config/ConfigManager';
import { KGCore } from '../../../core/KGCore';
import type {
  ChordGuideCustomConfig,
  ChordGuideData,
  ChordGuideGroupKey,
  ChordGuideItem,
  ChordGuideModeDefinition,
} from '../../../core/ChordGuideTypes';
import {
  buildChordGuideCustomConfigFromData,
  buildChordGuideDataFromDefaultsAndConfig,
  buildDerivedChordGuideItem,
  createDefaultChordForGroup,
} from '../../../util/chordGuideConfigUtil';
import { parseChordSymbol } from '../../../util/chordUtil';
import { showAlert } from '../../../util/dialogUtil';
import { isModifierKeyPressed } from '../../../util/osUtil';
import { useI18n } from '../../../i18n/useI18n';

type FunctionType = 'T' | 'S' | 'D';
type EditableColumn = 'name' | 'note';

interface EditingCell {
  group: ChordGuideGroupKey;
  rowIndex: number;
  column: EditableColumn;
  value: string;
}

const FUNCTION_BUTTONS: Array<{ value: FunctionType; label: string; title: string }> = [
  { value: 'T', label: 'T', title: 'Tonic' },
  { value: 'S', label: 'S', title: 'Subdominant' },
  { value: 'D', label: 'D', title: 'Dominant' },
];

const CONFIG_KEY = 'chord_guide.custom_items';

function cloneModeDefinition(definition: ChordGuideModeDefinition): ChordGuideModeDefinition {
  return {
    T: definition.T.map((item) => ({ ...item, notes: [...item.notes] })),
    S: definition.S.map((item) => ({ ...item, notes: [...item.notes] })),
    D: definition.D.map((item) => ({ ...item, notes: [...item.notes] })),
  };
}

function cloneCustomConfig(config: ChordGuideCustomConfig): ChordGuideCustomConfig {
  return {
    major: cloneModeDefinition(config.major),
    minor: cloneModeDefinition(config.minor),
  };
}

function getModeDefinition(config: ChordGuideCustomConfig, group: ChordGuideGroupKey): ChordGuideModeDefinition {
  return group === 'major' ? config.major : config.minor;
}

function setModeDefinition(
  config: ChordGuideCustomConfig,
  group: ChordGuideGroupKey,
  definition: ChordGuideModeDefinition,
): ChordGuideCustomConfig {
  return group === 'major'
    ? { ...config, major: definition }
    : { ...config, minor: definition };
}

async function loadBundledChordGuideData(): Promise<ChordGuideData> {
  const response = await fetch(`${import.meta.env.BASE_URL}resources/modes/chord_guide.json`);
  if (!response.ok) {
    throw new Error(`Failed to fetch chord_guide.json: ${response.status}`);
  }
  return response.json() as Promise<ChordGuideData>;
}

const ChordGuideSettings: React.FC = () => {
  const { t } = useI18n();
  const configManager = ConfigManager.instance();
  const [defaultsData, setDefaultsData] = React.useState<ChordGuideData | null>(null);
  const [customConfig, setCustomConfig] = React.useState<ChordGuideCustomConfig | null>(null);
  const [activeFunctions, setActiveFunctions] = React.useState<Record<ChordGuideGroupKey, FunctionType>>({
    major: 'T',
    minor: 'T',
  });
  const [selectedRows, setSelectedRows] = React.useState<Record<ChordGuideGroupKey, Set<number>>>({
    major: new Set(),
    minor: new Set(),
  });
  const [editingCell, setEditingCell] = React.useState<EditingCell | null>(null);
  const editInputRef = React.useRef<HTMLInputElement | null>(null);
  const previousEditingCellKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const initialize = async () => {
      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }

      const bundledData = await loadBundledChordGuideData();
      const persisted = configManager.get(CONFIG_KEY) as ChordGuideCustomConfig | null | undefined;
      setDefaultsData(bundledData);
      setCustomConfig(persisted ? cloneCustomConfig(persisted) : buildChordGuideCustomConfigFromData(bundledData));
    };

    void initialize().catch((error) => {
      console.error('Failed to initialize chord guide settings:', error);
      void showAlert(t('settings.chordGuide.loadError'));
    });
  }, [configManager, t]);

  React.useEffect(() => {
    if (!editingCell) {
      previousEditingCellKeyRef.current = null;
      return;
    }

    const editingCellKey = `${editingCell.group}-${editingCell.rowIndex}-${editingCell.column}`;
    if (previousEditingCellKeyRef.current === editingCellKey) {
      return;
    }
    previousEditingCellKeyRef.current = editingCellKey;

    editInputRef.current?.focus();
    editInputRef.current?.select();
  }, [editingCell]);

  const persistCustomConfig = React.useCallback(async (nextConfig: ChordGuideCustomConfig, persistValue: ChordGuideCustomConfig | null = nextConfig) => {
    if (!defaultsData) {
      return;
    }
    const cloned = cloneCustomConfig(nextConfig);
    setCustomConfig(cloned);
    KGCore.CHORD_GUIDE_DATA = buildChordGuideDataFromDefaultsAndConfig(defaultsData, cloned);
    await configManager.set(CONFIG_KEY, persistValue ? cloneCustomConfig(persistValue) : null);
  }, [configManager, defaultsData]);

  const updateGroupRows = React.useCallback(async (
    group: ChordGuideGroupKey,
    functionType: FunctionType,
    updater: (rows: ChordGuideItem[]) => ChordGuideItem[],
  ) => {
    if (!customConfig) {
      return;
    }
    const nextConfig = cloneCustomConfig(customConfig);
    const modeDefinition = getModeDefinition(nextConfig, group);
    const nextDefinition: ChordGuideModeDefinition = {
      ...modeDefinition,
      [functionType]: updater(modeDefinition[functionType]),
    };
    const updatedConfig = setModeDefinition(nextConfig, group, nextDefinition);
    await persistCustomConfig(updatedConfig);
  }, [customConfig, persistCustomConfig]);

  const commitEditingCell = React.useCallback(async () => {
    if (!editingCell || !customConfig) {
      return;
    }

    const { group, rowIndex, column } = editingCell;
    const functionType = activeFunctions[group];
    const modeDefinition = getModeDefinition(customConfig, group);
    const row = modeDefinition[functionType][rowIndex];
    if (!row) {
      setEditingCell(null);
      return;
    }

    const trimmedValue = editingCell.value.trim();
    if (column === 'name') {
      if (!trimmedValue || parseChordSymbol(trimmedValue) === null) {
        await showAlert(t('settings.chordGuide.invalidChordSymbol'));
        return;
      }
      const derived = buildDerivedChordGuideItem(group, { name: trimmedValue, note: row.note });
      if (!derived) {
        await showAlert(t('settings.chordGuide.unsupportedChordSymbol'));
        return;
      }
      await updateGroupRows(group, functionType, (rows) => rows.map((candidate, index) => (
        index === rowIndex
          ? { ...derived, roman: undefined }
          : candidate
      )));
    } else {
      await updateGroupRows(group, functionType, (rows) => rows.map((candidate, index) => (
        index === rowIndex
          ? { ...candidate, note: trimmedValue.slice(0, 128) }
          : candidate
      )));
    }

    setEditingCell(null);
  }, [activeFunctions, customConfig, editingCell, updateGroupRows]);

  const handleEditInputBlur = () => {
    void commitEditingCell();
  };

  const handleEditInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitEditingCell();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setEditingCell(null);
    }
  };

  const handleRowClick = (
    group: ChordGuideGroupKey,
    rowIndex: number,
    event: React.MouseEvent<HTMLTableRowElement>,
  ) => {
    event.stopPropagation();
    if (editingCell) {
      return;
    }

    const nextSelected = new Set(selectedRows[group]);
    if (isModifierKeyPressed(event)) {
      if (nextSelected.has(rowIndex)) {
        nextSelected.delete(rowIndex);
      } else {
        nextSelected.add(rowIndex);
      }
    } else {
      nextSelected.clear();
      nextSelected.add(rowIndex);
    }

    setSelectedRows((previous) => ({ ...previous, [group]: nextSelected }));
  };

  const handleTableBackgroundMouseDown = (group: ChordGuideGroupKey, event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    setSelectedRows((previous) => ({ ...previous, [group]: new Set() }));
  };

  const handleAddRow = async (group: ChordGuideGroupKey) => {
    const functionType = activeFunctions[group];
    const defaultChord = createDefaultChordForGroup(group);
    await updateGroupRows(group, functionType, (rows) => [...rows, { ...defaultChord, roman: undefined }]);
    setSelectedRows((previous) => ({ ...previous, [group]: new Set([getModeDefinition(customConfig!, group)[functionType].length]) }));
  };

  const handleDeleteRows = async (group: ChordGuideGroupKey) => {
    const selection = selectedRows[group];
    if (selection.size === 0) {
      return;
    }
    const functionType = activeFunctions[group];
    await updateGroupRows(group, functionType, (rows) => rows.filter((_, index) => !selection.has(index)));
    setSelectedRows((previous) => ({ ...previous, [group]: new Set() }));
  };

  const handleResetToDefault = async () => {
    if (!defaultsData) {
      return;
    }
    const resetConfig = buildChordGuideCustomConfigFromData(defaultsData);
    setEditingCell(null);
    setSelectedRows({ major: new Set(), minor: new Set() });
    setCustomConfig(resetConfig);
    KGCore.CHORD_GUIDE_DATA = buildChordGuideDataFromDefaultsAndConfig(defaultsData, resetConfig);
    await configManager.set(CONFIG_KEY, null);
  };

  const renderGroup = (group: ChordGuideGroupKey) => {
    if (!customConfig) {
      return null;
    }

    const functionType = activeFunctions[group];
    const rows = getModeDefinition(customConfig, group)[functionType];
    const selection = selectedRows[group];

    const groupLabel = t(`settings.chordGuide.group.${group}`);

    return (
      <div className="settings-group" key={group}>
        <div className="settings-group-header">
          <h4>{groupLabel}</h4>
        </div>
        <div className="settings-description">{t(`settings.chordGuide.help.${group}`)}</div>

        <div className="event-list-tabs" role="tablist" aria-label={t('settings.chordGuide.functionsAria', { group: groupLabel })}>
          {FUNCTION_BUTTONS.map((button) => (
            <button
              key={button.value}
              className={`event-list-tab${functionType === button.value ? ' active' : ''}`}
              type="button"
              title={button.title}
              onClick={() => {
                setActiveFunctions((previous) => ({ ...previous, [group]: button.value }));
                setSelectedRows((previous) => ({ ...previous, [group]: new Set() }));
                setEditingCell(null);
              }}
            >
              {button.label}
            </button>
          ))}
        </div>

        <div className="event-list-toolbar settings-chord-guide-toolbar">
          <div className="event-list-toolbar-group">
            <button
              className="event-list-add-button settings-chord-guide-add-button"
              title={t('settings.chordGuide.addTitle', { group: groupLabel })}
              type="button"
              onClick={() => { void handleAddRow(group); }}
            >
              <FaPlus />
            </button>
          </div>
          <div className="event-list-toolbar-group event-list-toolbar-group-right">
            <button
              className="event-list-delete-button"
              title={t('settings.chordGuide.deleteSelectedRows')}
              type="button"
              onClick={() => { void handleDeleteRows(group); }}
              disabled={selection.size === 0}
            >
              <FaTrash />
            </button>
          </div>
        </div>

        <div className="event-list-table-shell" onMouseDown={(event) => handleTableBackgroundMouseDown(group, event)}>
          <table className="event-list-table">
            <thead>
              <tr>
                <th>{t('settings.chordGuide.table.chord')}</th>
                <th>{t('settings.chordGuide.table.notes')}</th>
                <th>{t('settings.chordGuide.table.source')}</th>
                <th>{t('settings.chordGuide.table.note')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const isEditingName = editingCell?.group === group && editingCell.rowIndex === rowIndex && editingCell.column === 'name';
                const isEditingNote = editingCell?.group === group && editingCell.rowIndex === rowIndex && editingCell.column === 'note';
                return (
                  <tr
                    key={`${group}-${functionType}-${rowIndex}-${row.name}`}
                    className={selection.has(rowIndex) ? 'selected' : ''}
                    onClick={(event) => handleRowClick(group, rowIndex, event)}
                  >
                    <td
                      title={row.name}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        setEditingCell({ group, rowIndex, column: 'name', value: row.name });
                      }}
                    >
                      {isEditingName ? (
                        <input
                          ref={editInputRef}
                          className="event-list-cell-input"
                          value={editingCell.value}
                          onChange={(event) => setEditingCell({ ...editingCell, value: event.target.value })}
                          onBlur={handleEditInputBlur}
                          onClick={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => event.stopPropagation()}
                          onKeyDown={handleEditInputKeyDown}
                        />
                      ) : row.name}
                    </td>
                    <td title={row.notes.join(' ')}>{row.notes.join(' ')}</td>
                    <td title={row.source}>{row.source}</td>
                    <td
                      title={row.note}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        setEditingCell({ group, rowIndex, column: 'note', value: row.note });
                      }}
                    >
                      {isEditingNote ? (
                        <input
                          ref={editInputRef}
                          className="event-list-cell-input"
                          maxLength={128}
                          value={editingCell.value}
                          onChange={(event) => setEditingCell({ ...editingCell, value: event.target.value.slice(0, 128) })}
                          onBlur={handleEditInputBlur}
                          onClick={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => event.stopPropagation()}
                          onKeyDown={handleEditInputKeyDown}
                        />
                      ) : row.note}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h3>{t('settings.chordGuide.title')}</h3>
      </div>

      <div className="settings-section-content">
        <div className="settings-help-links settings-chord-guide-reset-row">
          <button className="settings-help" type="button" onClick={() => { void handleResetToDefault(); }}>
            {t('settings.chordGuide.resetToDefault')}
          </button>
        </div>
        {renderGroup('major')}
        {renderGroup('minor')}
      </div>
    </div>
  );
};

export default ChordGuideSettings;
