import { useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ToastContext, type ToastOptions } from './useToast';
import CloseIcon from './CloseIcon';
import styles from './Toast.module.css';

interface ToastItem {
  id: number;
  message: string;
  isError: boolean;
}

let toastId = 0;

const ERROR_PATTERN = /\b(error|failed|failure|invalid|unable|denied|cannot|can't|could not|unavailable|problem)\b/i;
const DEFAULT_DURATION = 3000;
const ERROR_DURATION = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, durationOrOptions?: number | ToastOptions) => {
    const options = typeof durationOrOptions === 'object' ? durationOrOptions : undefined;
    const duration = typeof durationOrOptions === 'number'
      ? durationOrOptions
      : options?.duration ?? DEFAULT_DURATION;
    const id = ++toastId;
    const isError = options?.kind === 'error'
      || (options?.kind !== 'info' && ERROR_PATTERN.test(message));
    const effectiveDuration = isError ? Math.max(duration, ERROR_DURATION) : duration;
    setToasts((prev) => [...prev, { id, message, isError }]);
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, effectiveDuration);
    timersRef.current.set(id, timer);
  }, []);

  // Clear any pending timers on unmount so state isn't updated afterwards.
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className={styles.toastContainer}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`${styles.toast}${toast.isError ? ` ${styles.toastError}` : ''}`}
            role="alert"
          >
            <span className={styles.toastMessage}>{toast.message}</span>
            <button
              type="button"
              className={styles.toastDismiss}
              onClick={() => dismiss(toast.id)}
              aria-label={t('common.dismissNotification')}
            >
              <CloseIcon size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
