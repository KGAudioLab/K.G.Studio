import React, { useCallback, useState } from 'react';
import { FaTimes } from 'react-icons/fa';

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
  title = 'Import Project',
  description = 'Drag and drop your project file here'
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set drag over to false if we're leaving the drop zone entirely
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      
      // Check if file type is accepted
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (acceptedTypes.includes(fileExtension)) {
        onFileImport(file);
        onClose();
      } else {
        alert(`Invalid file type. Please select a file with one of these extensions: ${acceptedTypes.join(', ')}`);
      }
    }
  }, [acceptedTypes, onFileImport, onClose]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileImport(files[0]);
      onClose();
    }
  }, [onFileImport, onClose]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    // Only close if clicking on the overlay itself, not the modal content
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="file-import-overlay" onClick={handleOverlayClick}>
      <div className="file-import-modal">
        <div className="file-import-header">
          <h3 className="file-import-title">{title}</h3>
          <button
            className="file-import-close-btn"
            onClick={onClose}
            aria-label="Close import modal"
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
            <p className="file-import-description">{description}</p>
            <p className="file-import-formats">
              Supported formats: {acceptedTypes.join(', ')}
            </p>
            
            <div className="file-import-divider">
              <span>or</span>
            </div>
            
            <label className="file-import-browse-btn">
              Browse Files
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