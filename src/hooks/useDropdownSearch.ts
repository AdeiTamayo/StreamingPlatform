import { useState, useEffect, useRef } from 'react';

export default function useDropdownSearch(open, onClose) {
  const [search, setSearch] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');

    function resetTimer() {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSearch(''), 1500);
    }

    function handleKey(e) {
      if (e.key === 'Escape') { onClose?.(); return; }
      if (e.key === 'Backspace') {
        setSearch((s) => s.slice(0, -1));
        resetTimer();
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        setSearch((s) => (s + e.key).toLowerCase());
        resetTimer();
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      clearTimeout(timerRef.current);
    };
  }, [open, onClose]);

  return search;
}
