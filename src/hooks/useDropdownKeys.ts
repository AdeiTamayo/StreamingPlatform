import { useState, useEffect, useRef } from 'react';

/**
 * Arrow-key navigation for listbox-style dropdowns.
 * Returns the active (highlighted) option index; Enter activates it,
 * Escape closes the menu.
 */
export default function useDropdownKeys(
  open: boolean,
  count: number,
  onActivate: (index: number) => void,
  onClose: () => void,
) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  activeIndexRef.current = activeIndex;
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setActiveIndex(0);
  }, [count]);

  useEffect(() => {
    if (!open || count === 0) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => {
          const delta = e.key === 'ArrowDown' ? 1 : -1;
          return (i + delta + count) % count;
        });
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActiveIndex(count - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onActivateRef.current(activeIndexRef.current);
      } else if (e.key === 'Escape') {
        onCloseRef.current();
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, count]);

  return activeIndex;
}
