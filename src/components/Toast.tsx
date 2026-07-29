import { useState, useCallback, ReactNode } from 'react';
import { ToastContext } from './useToast';
import styles from './Toast.module.css';

interface ToastItem {
  id: number;
  message: string;
}

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, duration = 3000) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className={styles.toastContainer} role="status" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div key={t.id} className={styles.toast}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
