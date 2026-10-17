import { useCallback, useEffect, useState } from "react";

export interface UseBulkSelectOptions {
  /**
   * Keys of the entries currently visible on screen (the active page). Used by
   * `selectPage` so it never reaches beyond what the user can see - matching
   * the Last Seen behaviour on Watch Later.
   */
  visibleKeys: string[];
  /** Called with the selected keys when the user confirms the bulk removal. */
  onRemove: (keys: string[]) => void;
}

export interface UseBulkSelectResult {
  selectMode: boolean;
  selectedKeys: Set<string>;
  confirmingBulkRemove: boolean;
  selectedCount: number;
  toggleSelectMode: () => void;
  toggleKey: (key: string) => void;
  selectPage: () => void;
  clearSelection: () => void;
  requestRemove: () => void;
  keepSelection: () => void;
  removeSelected: () => void;
}

/**
 * Shared bulk-selection state for the Watch Later / Last Seen list views.
 *
 * Owns selection mode, the selected key set and the two-step inline confirm,
 * so both pages stop duplicating the same toggle/Escape/select-page logic.
 */
export default function useBulkSelect({
  visibleKeys,
  onRemove,
}: UseBulkSelectOptions): UseBulkSelectResult {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [confirmingBulkRemove, setConfirmingBulkRemove] = useState(false);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
    setConfirmingBulkRemove(false);
  }, []);

  // Entry always starts from a clean slate, exit discards it: the set only
  // ever holds keys collected while the bar is visible.
  const toggleSelectMode = useCallback(() => {
    setSelectedKeys(new Set());
    setConfirmingBulkRemove(false);
    setSelectMode((prev) => !prev);
  }, []);

  // Escape leaves selection mode, same as the Done button. Self-contained so
  // it doesn't need toggleSelectMode in the deps.
  useEffect(() => {
    if (!selectMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setSelectMode(false);
      setSelectedKeys(new Set());
      setConfirmingBulkRemove(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode]);

  const toggleKey = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setConfirmingBulkRemove(false);
  }, []);

  const selectPage = useCallback(() => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const key of visibleKeys) next.add(key);
      return next;
    });
  }, [visibleKeys]);

  const requestRemove = useCallback(() => setConfirmingBulkRemove(true), []);
  const keepSelection = useCallback(() => setConfirmingBulkRemove(false), []);

  const removeSelected = useCallback(() => {
    const keys = [...selectedKeys];
    if (keys.length === 0) return;
    onRemove(keys);
    setSelectedKeys(new Set());
    setConfirmingBulkRemove(false);
  }, [onRemove, selectedKeys]);

  return {
    selectMode,
    selectedKeys,
    confirmingBulkRemove,
    selectedCount: selectedKeys.size,
    toggleSelectMode,
    toggleKey,
    selectPage,
    clearSelection,
    requestRemove,
    keepSelection,
    removeSelected,
  };
}
