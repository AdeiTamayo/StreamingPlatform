import { useEffect, useRef } from 'react';

export default function useClickOutside(handler: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      // Portaled UI (e.g. the notifications panel) lives outside the ref in the
      // DOM, so opt it out explicitly instead of treating it as an outside click.
      const target = e.target as Element | null;
      if (target?.closest?.('[data-click-outside-ignore]')) return;
      if (ref.current && !ref.current.contains(e.target as Node)) handlerRef.current();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return ref;
}
