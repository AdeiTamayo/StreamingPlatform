import { useState, useCallback } from 'react';
import { ToastContext } from './useToast';
import styles from './Toast.module.css';

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, duration = 3000) => {
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
