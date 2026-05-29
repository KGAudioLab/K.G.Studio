import React from 'react';
import { createPortal } from 'react-dom';
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
  renderInPortal?: boolean;
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
  renderInPortal = false,
}) => {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const [portalStyle, setPortalStyle] = React.useState<React.CSSProperties | undefined>(undefined);

  React.useLayoutEffect(() => {
    if (!isOpen || !renderInPortal || !triggerRef.current) {
      return;
    }

    const updatePortalStyle = () => {
      if (!triggerRef.current) {
        return;
      }

      const rect = triggerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const placementOffset = 14;

      if (placement === 'bottom') {
        setPortalStyle({
          position: 'fixed',
          top: `${rect.bottom + placementOffset}px`,
          left: `${centerX}px`,
          transform: 'translateX(-50%)',
        });
        return;
      }

      if (placement === 'top') {
        setPortalStyle({
          position: 'fixed',
          bottom: `${window.innerHeight - rect.top + placementOffset}px`,
          left: `${centerX}px`,
          transform: 'translateX(-50%)',
        });
        return;
      }

      setPortalStyle({
        position: 'fixed',
        top: `${rect.bottom + placementOffset}px`,
        left: `${centerX}px`,
        transform: 'translateX(-50%)',
      });
    };

    updatePortalStyle();
    window.addEventListener('resize', updatePortalStyle);
    window.addEventListener('scroll', updatePortalStyle, true);

    return () => {
      window.removeEventListener('resize', updatePortalStyle);
      window.removeEventListener('scroll', updatePortalStyle, true);
    };
  }, [isOpen, placement, renderInPortal]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      const isInsideRoot = rootRef.current?.contains(targetNode) ?? false;
      const isInsideSurface = surfaceRef.current?.contains(targetNode) ?? false;

      if (!isInsideRoot && !isInsideSurface) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        onClose();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose]);

  const popupSurface = isOpen ? (
    <div
      ref={surfaceRef}
      className={`floating-popup-surface ${contentClassName}`.trim()}
      data-placement={placement}
      role="dialog"
      aria-modal="false"
      style={renderInPortal ? portalStyle : undefined}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
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
  ) : null;

  return (
    <div className={`floating-popup ${className}`.trim()} ref={rootRef}>
      <div className={`floating-popup-trigger ${triggerClassName}`.trim()} ref={triggerRef}>
        {trigger}
      </div>
      {renderInPortal && popupSurface ? createPortal(popupSurface, document.body) : popupSurface}
    </div>
  );
};

export default FloatingPopup;
