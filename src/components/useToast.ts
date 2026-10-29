import { createContext, useContext } from 'react';

export type ToastKind = 'info' | 'error';

export interface ToastOptions {
  duration?: number;
  /**
   * Explicit severity. Needed once messages are translated: the English
   * keyword heuristic in Toast.tsx cannot classify Spanish/Basque copy.
   */
  kind?: ToastKind;
}

type AddToast = {
  (message: string, duration?: number): void;
  (message: string, options: ToastOptions): void;
};

export const ToastContext = createContext<AddToast | null>(null);

export function useToast() {
  return useContext(ToastContext);
}
