import React, { useState, useCallback, useRef } from 'react';
import './DialogProvider.css';
import { FaTimes } from 'react-icons/fa';

export interface ConfirmOptions {
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface PromptOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
}

let _showAlertFn: ((message: string) => Promise<void>) | null = null;
let _showConfirmFn: ((message: string, options?: ConfirmOptions) => Promise<boolean>) | null = null;
let _showPromptFn: ((message: string, defaultValue?: string, options?: PromptOptions) => Promise<string | null>) | null = null;

export function showAlert(message: string): Promise<void> {
  if (!_showAlertFn) {
    window.alert(message);
    return Promise.resolve();
  }
  return _showAlertFn(message);
}

export function showConfirm(message: string, options?: ConfirmOptions): Promise<boolean> {
  if (!_showConfirmFn) {
    return Promise.resolve(window.confirm(message));
  }
  return _showConfirmFn(message, options);
}

export function showPrompt(message: string, defaultValue?: string, options?: PromptOptions): Promise<string | null> {
  if (!_showPromptFn) {
    return Promise.resolve(window.prompt(message, defaultValue) );
  }
  return _showPromptFn(message, defaultValue, options);
}

interface DialogInfo {
  type: 'alert' | 'confirm' | 'prompt';
  message: string;
  options?: ConfirmOptions | PromptOptions;
  defaultValue?: string;
}

const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialog, setDialog] = useState<DialogInfo | null>(null);
  const [inputValue, setInputValue] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolveRef = useRef<((value: any) => void) | null>(null);

  const openAlert = useCallback((message: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      resolveRef.current = resolve;
      setDialog({ type: 'alert', message });
    });
  }, []);

  const openConfirm = useCallback((message: string, options?: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setDialog({ type: 'confirm', message, options });
    });
  }, []);

  const openPrompt = useCallback((message: string, defaultValue?: string, options?: PromptOptions): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      resolveRef.current = resolve;
      setInputValue(defaultValue ?? '');
      setDialog({ type: 'prompt', message, options, defaultValue });
    });
  }, []);

  const close = useCallback((value: unknown) => {
    setDialog(null);
    setInputValue('');
    if (resolveRef.current) {
      resolveRef.current(value);
      resolveRef.current = null;
    }
  }, []);

  const registered = useRef(false);
  if (!registered.current) {
    registered.current = true;
    _showAlertFn = openAlert;
    _showConfirmFn = openConfirm;
    _showPromptFn = openPrompt;
  }

  if (!dialog) {
    return <>{children}</>;
  }

  const isAlert = dialog.type === 'alert';
  const isPrompt = dialog.type === 'prompt';
  const promptOptions = isPrompt ? (dialog.options as PromptOptions | undefined) : undefined;

  const title = isAlert ? 'Notice' : isPrompt ? 'Input' : 'Confirm';

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      close(isAlert ? undefined : isPrompt ? null : false);
    }
  };

  const handleCancel = () => close(isAlert ? undefined : isPrompt ? null : false);
  const handleConfirm = () => close(isAlert ? undefined : isPrompt ? inputValue : true);

  return (
    <>
      {children}
      <div className="dialog-overlay" onClick={handleOverlayClick}>
        <div className="dialog-modal">
          <div className="dialog-header">
            <h3 className="dialog-title">{title}</h3>
            <button
              className="dialog-close-btn"
              onClick={handleCancel}
              aria-label="Close dialog"
            >
              <FaTimes />
            </button>
          </div>
          <div className="dialog-body">
            <p className="dialog-message">{dialog.message}</p>
            {isPrompt && (
              <input
                className="dialog-input"
                type="text"
                value={inputValue}
                placeholder={promptOptions?.placeholder}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirm();
                  if (e.key === 'Escape') handleCancel();
                }}
                autoFocus
              />
            )}
          </div>
          <div className="dialog-footer">
            {!isAlert && (
              <button
                className="dialog-btn dialog-btn-cancel"
                onClick={handleCancel}
              >
                {(dialog.options as ConfirmOptions | PromptOptions | undefined)?.cancelLabel ?? 'Cancel'}
              </button>
            )}
            <button
              className="dialog-btn dialog-btn-primary"
              onClick={handleConfirm}
              autoFocus={!isPrompt}
            >
              {isAlert ? 'OK' : ((dialog.options as ConfirmOptions | PromptOptions | undefined)?.confirmLabel ?? (isPrompt ? 'OK' : 'Yes'))}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default DialogProvider;
