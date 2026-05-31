import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FaTimes, FaSortUp, FaSortDown, FaCopy, FaTrash, FaUndo } from 'react-icons/fa';
import { KGProjectStorage, type ProjectMeta } from '../../core/io/KGProjectStorage';
import { isValidProjectName } from '../../util/projectNameUtil';
import './OpenProjectModal.css';
import { showAlert, showConfirm, showPrompt } from '../../util/dialogUtil';
import { useI18n } from '../../i18n/useI18n';
import { translate } from '../../i18n/translate';

interface OpenProjectModalProps {
  onClose: () => void;
  onConfirmOpenProject: (projectName: string) => Promise<boolean>;
  onOpenProject: (projectName: string) => Promise<void>;
  currentProjectName: string | null;
  onCreateNewProject: () => void;
}

type SortField = 'name' | 'createdAt' | 'updatedAt';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'projects' | 'trash';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const matchesFilter = (projectName: string, filter: string): boolean => {
  if (!filter) return true;
  const normalizedName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedFilter = filter.toLowerCase().replace(/[^a-z0-9]/g, '');

  let nameIndex = 0;
  for (let i = 0; i < normalizedFilter.length; i++) {
    const charIndex = normalizedName.indexOf(normalizedFilter[i], nameIndex);
    if (charIndex === -1) return false;
    nameIndex = charIndex + 1;
  }
  return true;
};

const formatDate = (timestamp: number): string => {
  if (timestamp === 0) return translate('openProjectModal.date.unknown');
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const OpenProjectModal: React.FC<OpenProjectModalProps> = ({
  onClose,
  onConfirmOpenProject,
  onOpenProject,
  currentProjectName,
  onCreateNewProject
}) => {
  const { t } = useI18n();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const mouseDownOnOverlay = useRef(false);
  const pendingOpenProjectName = useRef<string | null>(null);

  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const [viewMode, setViewMode] = useState<ViewMode>('projects');

  const startClose = useCallback(() => setIsClosing(true), []);

  const handleAnimationEnd = useCallback((e: React.AnimationEvent) => {
    if (e.target !== e.currentTarget) return;
    if (!isClosing) return;

    const projectNameToOpen = pendingOpenProjectName.current;
    pendingOpenProjectName.current = null;
    setIsClosing(false);
    onClose();

    if (projectNameToOpen) {
      void onOpenProject(projectNameToOpen);
    }
  }, [isClosing, onClose, onOpenProject]);

  const fetchProjects = useCallback(async (mode: ViewMode) => {
    setIsLoading(true);
    try {
      const storage = KGProjectStorage.getInstance();

      if (mode === 'trash') {
        await storage.purgeDeletedOlderThan(THIRTY_DAYS_MS);
      }

      const list = await storage.listWithMeta(mode === 'trash');
      setProjects(list);
    } catch (error) {
      console.error('Error loading project list:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects(viewMode);
  }, [viewMode, fetchProjects]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') startClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [startClose]);

  const handleSortClick = useCallback((field: SortField) => {
    if (field === sortField) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'name' ? 'asc' : 'desc');
    }
  }, [sortField]);

  const filteredProjects = React.useMemo(() => {
    const filtered = projects.filter(p => matchesFilter(p.name, filter));

    filtered.sort((a, b) => {
      let cmp: number;
      if (sortField === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else {
        cmp = a[sortField] - b[sortField];
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [projects, filter, sortField, sortDirection]);

  const handleOpen = async (projectName: string) => {
    const confirmed = await onConfirmOpenProject(projectName);
    if (!confirmed) return;

    pendingOpenProjectName.current = projectName;
    startClose();
  };

  const handleDuplicate = async (e: React.MouseEvent, projectName: string) => {
    e.stopPropagation();
    const newName = await showPrompt(t('openProjectModal.dialog.duplicateName'), projectName);
    if (!newName || newName.trim() === '') return;

    const trimmed = newName.trim();
    if (!isValidProjectName(trimmed)) {
      await showAlert(t('openProjectModal.dialog.invalidName'));
      return;
    }

    try {
      const storage = KGProjectStorage.getInstance();
      const finalName = await storage.resolveUniqueName(trimmed);
      const confirmed = await onConfirmOpenProject(finalName);
      if (!confirmed) return;

      await storage.duplicate(projectName, finalName);
      pendingOpenProjectName.current = finalName;
      startClose();
    } catch (error) {
      console.error('Error duplicating project:', error);
      await showAlert(t('openProjectModal.dialog.duplicateError', { error: String(error) }));
    }
  };

  const handleSoftDelete = async (e: React.MouseEvent, projectName: string) => {
    e.stopPropagation();
    try {
      const storage = KGProjectStorage.getInstance();
      await storage.softDelete(projectName);
      await fetchProjects(viewMode);
    } catch (error) {
      console.error('Error deleting project:', error);
      await showAlert(t('openProjectModal.dialog.deleteError', { error: String(error) }));
    }
  };

  const handleRestore = async (e: React.MouseEvent, projectName: string) => {
    e.stopPropagation();
    try {
      const storage = KGProjectStorage.getInstance();
      await storage.restore(projectName);
      await fetchProjects(viewMode);
    } catch (error) {
      console.error('Error restoring project:', error);
      await showAlert(t('openProjectModal.dialog.restoreError', { error: String(error) }));
    }
  };

  const handlePermanentDelete = async (e: React.MouseEvent, projectName: string) => {
    e.stopPropagation();
    const confirmed = await showConfirm(
      t('openProjectModal.dialog.confirmPermanentDelete', { name: projectName })
    );
    if (!confirmed) return;

    try {
      const storage = KGProjectStorage.getInstance();
      await storage.delete(projectName);
      await fetchProjects(viewMode);

      if (currentProjectName && projectName === currentProjectName) {
        onCreateNewProject();
      }
    } catch (error) {
      console.error('Error permanently deleting project:', error);
      await showAlert(t('openProjectModal.dialog.permanentDeleteError', { error: String(error) }));
    }
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setFilter('');
  };

  const handleOverlayMouseDown = useCallback((e: React.MouseEvent) => {
    mouseDownOnOverlay.current = e.target === e.currentTarget;
  }, []);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && mouseDownOnOverlay.current) {
      startClose();
    }
  }, [startClose]);

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <FaSortUp /> : <FaSortDown />;
  };

  return (
    <div
      className={`open-project-overlay${isClosing ? ' open-project-overlay-closing' : ''}`}
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
      onAnimationEnd={handleAnimationEnd}
    >
      <div className={`open-project-panel${isClosing ? ' open-project-panel-closing' : ''}`}>
        <div className="open-project-header">
          <h3 className="open-project-title">{t('openProjectModal.title')}</h3>
          <button className="open-project-close-btn" onClick={startClose} aria-label={t('openProjectModal.close')}>
            <FaTimes />
          </button>
        </div>

        <div className="open-project-filter">
          <div className="open-project-filter-row">
            <input
              type="text"
              placeholder={t('openProjectModal.filter.placeholder')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              autoFocus
            />
            <div className="open-project-view-toggle">
              <button
                className={`open-project-toggle-btn ${viewMode === 'projects' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('projects')}
              >
                {t('openProjectModal.viewToggle.projects')}
              </button>
              <button
                className={`open-project-toggle-btn ${viewMode === 'trash' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('trash')}
              >
                {t('openProjectModal.viewToggle.trash')}
              </button>
            </div>
          </div>
        </div>

        {viewMode === 'trash' && (
          <div className="open-project-trash-hint">
            {t('openProjectModal.trash.hint')}
          </div>
        )}

        <div className="open-project-sort-header">
          <span
            className={`open-project-sort-col open-project-sort-col-name ${sortField === 'name' ? 'active' : ''}`}
            onClick={() => handleSortClick('name')}
          >
            {t('openProjectModal.sort.name')} <SortIcon field="name" />
          </span>
          <span
            className={`open-project-sort-col open-project-sort-col-created ${sortField === 'createdAt' ? 'active' : ''}`}
            onClick={() => handleSortClick('createdAt')}
          >
            {t('openProjectModal.sort.created')} <SortIcon field="createdAt" />
          </span>
          <span
            className={`open-project-sort-col open-project-sort-col-updated ${sortField === 'updatedAt' ? 'active' : ''}`}
            onClick={() => handleSortClick('updatedAt')}
          >
            {t('openProjectModal.sort.updated')} <SortIcon field="updatedAt" />
          </span>
        </div>

        {isLoading ? (
          <div className="open-project-loading">{t('openProjectModal.loading')}</div>
        ) : filteredProjects.length === 0 ? (
          <div className="open-project-empty">
            {projects.length === 0
              ? (viewMode === 'trash' ? t('openProjectModal.empty.trash') : t('openProjectModal.empty.noProjects'))
              : t('openProjectModal.empty.noMatch')}
          </div>
        ) : (
          <div className="open-project-list">
            {filteredProjects.map((project) => (
              <div
                key={project.name}
                className="open-project-item"
                onClick={viewMode === 'projects' ? () => handleOpen(project.name) : undefined}
              >
                <div className="open-project-item-info">
                  <div className="open-project-item-name">{project.name}</div>
                  <div className="open-project-item-meta">
                    {t('openProjectModal.meta.created', { date: formatDate(project.createdAt) })} &middot; {t('openProjectModal.meta.updated', { date: formatDate(project.updatedAt) })}
                    {viewMode === 'trash' && project.deletedAt && (
                      <> &middot; {t('openProjectModal.meta.deleted', { date: formatDate(project.deletedAt) })}</>
                    )}
                  </div>
                </div>
                <div className="open-project-item-actions">
                  {viewMode === 'projects' ? (
                    <>
                      <button
                        className="open-project-item-open-btn"
                        onClick={(e) => { e.stopPropagation(); handleOpen(project.name); }}
                      >
                        {t('openProjectModal.action.open')}
                      </button>
                      <button
                        className="open-project-item-action-btn open-project-item-duplicate-btn"
                        onClick={(e) => handleDuplicate(e, project.name)}
                        title={t('openProjectModal.action.duplicate')}
                      >
                        <FaCopy />
                      </button>
                      <button
                        className="open-project-item-action-btn open-project-item-delete-btn"
                        onClick={(e) => handleSoftDelete(e, project.name)}
                        title={t('openProjectModal.action.delete')}
                      >
                        <FaTrash />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="open-project-item-action-btn open-project-item-restore-btn"
                        onClick={(e) => handleRestore(e, project.name)}
                        title={t('openProjectModal.action.restore')}
                      >
                        <FaUndo />
                      </button>
                      <button
                        className="open-project-item-action-btn open-project-item-permdelete-btn"
                        onClick={(e) => handlePermanentDelete(e, project.name)}
                        title={t('openProjectModal.action.deletePermanently')}
                      >
                        <FaTrash />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OpenProjectModal;
