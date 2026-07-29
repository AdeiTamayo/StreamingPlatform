import { createContext, useContext } from 'react';

type AddToast = (message: string, duration?: number) => void;

export const ToastContext = createContext<AddToast | null>(null);

export function useToast() {
  return useContext(ToastContext);
}
