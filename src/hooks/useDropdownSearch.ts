import { useState, useEffect, useRef } from 'react';
import { isTypingTarget } from '../utils/isTypingTarget';

export default function useDropdownSearch(open: boolean, onClose: () => void) {
  const [search, setSearch] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const wasOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Reset the buffer only on a false -> true transition of `open`.
    // Previously this ran on every effect execution, which - combined with
    // recreated onClose callbacks in the deps - wiped the search after every
    // keystroke and made typeahead impossible.
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (open && !wasOpen) {
      setSearch('');
    }

    if (!open) return;

    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSearch(''), 1500);
    }

    function handleKey(e: KeyboardEvent) {
      // Typeahead must not eat keystrokes aimed at a focused field elsewhere
      // (e.g. the navbar search box) while this dropdown is open.
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Escape') { onCloseRef.current?.(); return; }
      if (e.key === 'Backspace') {
        setSearch((s) => s.slice(0, -1));
        resetTimer();
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setSearch((s) => (s + e.key).toLowerCase());
        resetTimer();
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open]);

  return search;
}
