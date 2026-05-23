import React from 'react';
import './FloatingPopup.css';

type FloatingPopupPlacement = 'bottom' | 'top' | 'left' | 'right';

interface FloatingPopupProps {
  isOpen: boolean;
  onClose: () => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  placement?: FloatingPopupPlacement;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  panelClassName?: string;
  arrowClassName?: string;
}

const FloatingPopup: React.FC<FloatingPopupProps> = ({
  isOpen,
  onClose,
  trigger,
  children,
  placement = 'bottom',
  className = '',
  triggerClassName = '',
  contentClassName = '',
  panelClassName = '',
  arrowClassName = '',
}) => {
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div className={`floating-popup ${className}`.trim()} ref={rootRef}>
      <div className={`floating-popup-trigger ${triggerClassName}`.trim()}>
        {trigger}
      </div>
      {isOpen && (
        <div
          className={`floating-popup-surface ${contentClassName}`.trim()}
          data-placement={placement}
          role="dialog"
          aria-modal="false"
        >
          <div
            className={`floating-popup-arrow ${arrowClassName}`.trim()}
            data-placement={placement}
            aria-hidden="true"
          />
          <div className={`floating-popup-panel ${panelClassName}`.trim()}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
};

export default FloatingPopup;
