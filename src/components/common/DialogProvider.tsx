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

export interface TimeSigResult {
  numerator: number;
  denominator: number;
}

let _showAlertFn: ((message: string) => Promise<void>) | null = null;
let _showConfirmFn: ((message: string, options?: ConfirmOptions) => Promise<boolean>) | null = null;
let _showPromptFn: ((message: string, defaultValue?: string, options?: PromptOptions) => Promise<string | null>) | null = null;
let _showTimeSigFn: ((message: string, defaultValue?: TimeSigResult) => Promise<TimeSigResult | null>) | null = null;

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
    return Promise.resolve(window.prompt(message, defaultValue));
  }
  return _showPromptFn(message, defaultValue, options);
}

export function showTimeSigPrompt(message: string, defaultValue?: TimeSigResult): Promise<TimeSigResult | null> {
  if (!_showTimeSigFn) {
    const raw = window.prompt(message, defaultValue ? `${defaultValue.numerator}/${defaultValue.denominator}` : '4/4');
    if (!raw) return Promise.resolve(null);
    const [n, d] = raw.split('/').map(Number);
    if (!n || !d) return Promise.resolve(null);
    return Promise.resolve({ numerator: n, denominator: d });
  }
  return _showTimeSigFn(message, defaultValue);
}

interface DialogInfo {
  type: 'alert' | 'confirm' | 'prompt' | 'timesig';
  message: string;
  options?: ConfirmOptions | PromptOptions;
  defaultValue?: string;
  defaultTimeSig?: TimeSigResult;
}

const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialog, setDialog] = useState<DialogInfo | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [timeSigNumerator, setTimeSigNumerator] = useState('');
  const [timeSigDenominator, setTimeSigDenominator] = useState('');
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

  const openTimeSig = useCallback((message: string, defaultValue?: TimeSigResult): Promise<TimeSigResult | null> => {
    return new Promise<TimeSigResult | null>((resolve) => {
      resolveRef.current = resolve;
      setTimeSigNumerator(String(defaultValue?.numerator ?? 4));
      setTimeSigDenominator(String(defaultValue?.denominator ?? 4));
      setDialog({ type: 'timesig', message, defaultTimeSig: defaultValue });
    });
  }, []);

  const close = useCallback((value: unknown) => {
    setDialog(null);
    setInputValue('');
    setTimeSigNumerator('');
    setTimeSigDenominator('');
    if (resolveRef.current) {
      resolveRef.current(value);
      resolveRef.current = null;
    }
  }, []);

  const mouseDownOnOverlay = useRef(false);

  const registered = useRef(false);
  if (!registered.current) {
    registered.current = true;
    _showAlertFn = openAlert;
    _showConfirmFn = openConfirm;
    _showPromptFn = openPrompt;
    _showTimeSigFn = openTimeSig;
  }

  if (!dialog) {
    return <>{children}</>;
  }

  const isAlert = dialog.type === 'alert';
  const isPrompt = dialog.type === 'prompt';
  const isTimeSig = dialog.type === 'timesig';
  const promptOptions = isPrompt ? (dialog.options as PromptOptions | undefined) : undefined;

  const title = isAlert ? 'Notice' : isTimeSig ? 'Time Signature' : isPrompt ? 'Input' : 'Confirm';

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    mouseDownOnOverlay.current = e.target === e.currentTarget;
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && mouseDownOnOverlay.current) {
      close(isAlert ? undefined : (isPrompt || isTimeSig) ? null : false);
    }
  };

  const handleCancel = () => close(isAlert ? undefined : (isPrompt || isTimeSig) ? null : false);

  const handleConfirm = () => {
    if (isAlert) { close(undefined); return; }
    if (isPrompt) { close(inputValue); return; }
    if (isTimeSig) {
      close({ numerator: Number(timeSigNumerator), denominator: Number(timeSigDenominator) });
      return;
    }
    close(true);
  };

  return (
    <>
      {children}
      <div className="dialog-overlay" onMouseDown={handleOverlayMouseDown} onClick={handleOverlayClick}>
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
            {isTimeSig && (
              <div className="dialog-timesig-row">
                <input
                  className="dialog-input dialog-timesig-input"
                  type="number"
                  min={1}
                  value={timeSigNumerator}
                  onChange={(e) => setTimeSigNumerator(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirm();
                    if (e.key === 'Escape') handleCancel();
                  }}
                  autoFocus
                />
                <span className="dialog-timesig-sep">/</span>
                <input
                  className="dialog-input dialog-timesig-input"
                  type="number"
                  min={1}
                  value={timeSigDenominator}
                  onChange={(e) => setTimeSigDenominator(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirm();
                    if (e.key === 'Escape') handleCancel();
                  }}
                />
              </div>
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
              autoFocus={!isPrompt && !isTimeSig}
            >
              {isAlert ? 'OK' : ((dialog.options as ConfirmOptions | PromptOptions | undefined)?.confirmLabel ?? (isPrompt || isTimeSig ? 'OK' : 'Yes'))}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default DialogProvider;
