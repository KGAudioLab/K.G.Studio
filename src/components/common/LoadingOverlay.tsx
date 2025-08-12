import React from 'react';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ visible, message = 'Loading ...' }) => {
  if (!visible) return null;

  return (
    <div className="global-loading-overlay" role="status" aria-live="polite" aria-busy={true}>
      <div className="global-loading-content">
        <div className="global-loading-spinner" />
        <div className="global-loading-text">{message}</div>
      </div>
    </div>
  );
};

export default LoadingOverlay;


