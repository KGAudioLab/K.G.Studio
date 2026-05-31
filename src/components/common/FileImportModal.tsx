import React, { useCallback, useRef, useState } from 'react';
import './FileImportModal.css';
import { FaTimes } from 'react-icons/fa';
import { showAlert } from '../../util/dialogUtil';
import { useI18n } from '../../i18n/useI18n';

interface FileImportModalProps {
  isVisible: boolean;
  onClose: () => void;
  onFileImport: (file: File) => void;
  acceptedTypes?: string[];
  title?: string;
  description?: string;
}

const FileImportModal: React.FC<FileImportModalProps> = ({
  isVisible,
  onClose,
  onFileImport,
  acceptedTypes = ['.json'],
  title,
  description,
}) => {
  const { t } = useI18n();
  const resolvedTitle = title ?? t('toolbar.importProject.title');
  const resolvedDescription = description ?? t('toolbar.importProject.description');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const mouseDownOnOverlay = useRef(false);

  const startClose = useCallback(() => setIsClosing(true), []);

  const handleAnimationEnd = useCallback((e: React.AnimationEvent) => {
    if (e.target !== e.currentTarget) return;
    if (!isClosing) return;
    setIsClosing(false);
    onClose();
  }, [isClosing, onClose]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (acceptedTypes.includes(fileExtension)) {
        onFileImport(file);
        startClose();
      } else {
        await showAlert(t('fileImport.invalidType', { extensions: acceptedTypes.join(', ') }));
      }
    }
  }, [acceptedTypes, onFileImport, startClose]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileImport(files[0]);
      startClose();
    }
  }, [onFileImport, startClose]);

  const handleOverlayMouseDown = useCallback((e: React.MouseEvent) => {
    mouseDownOnOverlay.current = e.target === e.currentTarget;
  }, []);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && mouseDownOnOverlay.current) {
      startClose();
    }
  }, [startClose]);

  if (!isVisible && !isClosing) {
    return null;
  }

  return (
    <div
      className={`file-import-overlay${isClosing ? ' file-import-overlay-closing' : ''}`}
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
      onAnimationEnd={handleAnimationEnd}
    >
      <div className={`file-import-modal${isClosing ? ' file-import-modal-closing' : ''}`}>
        <div className="file-import-header">
          <h3 className="file-import-title">{resolvedTitle}</h3>
          <button
            className="file-import-close-btn"
            onClick={startClose}
            aria-label={t('fileImport.close')}
          >
            <FaTimes />
          </button>
        </div>

        <div
          className={`file-import-drop-zone ${isDragOver ? 'drag-over' : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="file-import-drop-content">
            <div className="file-import-icon">📁</div>
            <p className="file-import-description">{resolvedDescription}</p>
            <p className="file-import-formats">
              {t('fileImport.supportedFormats', { formats: acceptedTypes.join(', ') })}
            </p>

            <div className="file-import-divider">
              <span>{t('fileImport.or')}</span>
            </div>

            <label className="file-import-browse-btn">
              {t('fileImport.browse')}
              <input
                type="file"
                accept={acceptedTypes.join(',')}
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileImportModal;
