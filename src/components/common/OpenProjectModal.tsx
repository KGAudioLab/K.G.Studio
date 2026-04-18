import React, { useState, useEffect, useCallback } from 'react';
import { FaTimes, FaSortUp, FaSortDown, FaCopy, FaTrash, FaUndo } from 'react-icons/fa';
import { KGProjectStorage, type ProjectMeta } from '../../core/io/KGProjectStorage';
import { isValidProjectName } from '../../util/projectNameUtil';
import './OpenProjectModal.css';

interface OpenProjectModalProps {
  onClose: () => void;
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
  if (timestamp === 0) return 'Unknown';
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const OpenProjectModal: React.FC<OpenProjectModalProps> = ({ onClose, onOpenProject, currentProjectName, onCreateNewProject }) => {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const [viewMode, setViewMode] = useState<ViewMode>('projects');

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
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
    await onOpenProject(projectName);
    onClose();
  };

  const handleDuplicate = async (e: React.MouseEvent, projectName: string) => {
    e.stopPropagation();
    const newName = window.prompt('Enter a name for the duplicated project:', projectName);
    if (!newName || newName.trim() === '') return;

    const trimmed = newName.trim();
    if (!isValidProjectName(trimmed)) {
      window.alert('Invalid project name. Only letters, numbers, spaces, hyphens, underscores, periods, and parentheses are allowed.');
      return;
    }

    try {
      const storage = KGProjectStorage.getInstance();
      const finalName = await storage.resolveUniqueName(trimmed);
      await storage.duplicate(projectName, finalName);
      await onOpenProject(finalName);
      onClose();
    } catch (error) {
      console.error('Error duplicating project:', error);
      window.alert(`Failed to duplicate project: ${error}`);
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
      window.alert(`Failed to delete project: ${error}`);
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
      window.alert(`Failed to restore project: ${error}`);
    }
  };

  const handlePermanentDelete = async (e: React.MouseEvent, projectName: string) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${projectName}"?\n\nThis operation cannot be undone.`
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
      window.alert(`Failed to permanently delete project: ${error}`);
    }
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setFilter('');
  };

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <FaSortUp /> : <FaSortDown />;
  };

  return (
    <div className="open-project-overlay" onClick={handleOverlayClick}>
      <div className="open-project-panel">
        <div className="open-project-header">
          <h3 className="open-project-title">Open Project</h3>
          <button className="open-project-close-btn" onClick={onClose} aria-label="Close">
            <FaTimes />
          </button>
        </div>

        <div className="open-project-filter">
          <div className="open-project-filter-row">
            <input
              type="text"
              placeholder="Filter projects..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              autoFocus
            />
            <div className="open-project-view-toggle">
              <button
                className={`open-project-toggle-btn ${viewMode === 'projects' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('projects')}
              >
                Projects
              </button>
              <button
                className={`open-project-toggle-btn ${viewMode === 'trash' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('trash')}
              >
                Trash
              </button>
            </div>
          </div>
        </div>

        {viewMode === 'trash' && (
          <div className="open-project-trash-hint">
            Deleted projects are automatically removed after 30 days.
          </div>
        )}

        <div className="open-project-sort-header">
          <span
            className={`open-project-sort-col open-project-sort-col-name ${sortField === 'name' ? 'active' : ''}`}
            onClick={() => handleSortClick('name')}
          >
            Name <SortIcon field="name" />
          </span>
          <span
            className={`open-project-sort-col open-project-sort-col-created ${sortField === 'createdAt' ? 'active' : ''}`}
            onClick={() => handleSortClick('createdAt')}
          >
            Created <SortIcon field="createdAt" />
          </span>
          <span
            className={`open-project-sort-col open-project-sort-col-updated ${sortField === 'updatedAt' ? 'active' : ''}`}
            onClick={() => handleSortClick('updatedAt')}
          >
            Updated <SortIcon field="updatedAt" />
          </span>
        </div>

        {isLoading ? (
          <div className="open-project-loading">Loading projects...</div>
        ) : filteredProjects.length === 0 ? (
          <div className="open-project-empty">
            {projects.length === 0
              ? (viewMode === 'trash' ? 'Trash is empty' : 'No saved projects')
              : 'No projects match the filter'}
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
                    Created {formatDate(project.createdAt)} &middot; Updated {formatDate(project.updatedAt)}
                    {viewMode === 'trash' && project.deletedAt && (
                      <> &middot; Deleted {formatDate(project.deletedAt)}</>
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
                        Open
                      </button>
                      <button
                        className="open-project-item-action-btn open-project-item-duplicate-btn"
                        onClick={(e) => handleDuplicate(e, project.name)}
                        title="Duplicate"
                      >
                        <FaCopy />
                      </button>
                      <button
                        className="open-project-item-action-btn open-project-item-delete-btn"
                        onClick={(e) => handleSoftDelete(e, project.name)}
                        title="Delete"
                      >
                        <FaTrash />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="open-project-item-action-btn open-project-item-restore-btn"
                        onClick={(e) => handleRestore(e, project.name)}
                        title="Restore"
                      >
                        <FaUndo />
                      </button>
                      <button
                        className="open-project-item-action-btn open-project-item-permdelete-btn"
                        onClick={(e) => handlePermanentDelete(e, project.name)}
                        title="Delete permanently"
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
