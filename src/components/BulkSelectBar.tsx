import styles from "./BulkSelectBar.module.css";

interface BulkSelectBarProps {
  selectedCount: number;
  confirming: boolean;
  /** Omitted when there is nothing selectable on the current page. */
  onSelectPage?: () => void;
  onClear: () => void;
  onRequestRemove: () => void;
  onKeep: () => void;
  onConfirmRemove: () => void;
}

/**
 * Shared bulk-selection toolbar rendered by Watch Later and Last Seen while
 * selection mode is active. Chrome-free by design: the card checkboxes carry
 * the state, so the bar is only a count plus its actions.
 */
export default function BulkSelectBar({
  selectedCount,
  confirming,
  onSelectPage,
  onClear,
  onRequestRemove,
  onKeep,
  onConfirmRemove,
}: BulkSelectBarProps) {
  return (
    <div className={styles.selectBar} role="toolbar" aria-label="Bulk selection">
      <span className={styles.selectCount} role="status">
        {selectedCount === 0
          ? "No titles selected"
          : `${selectedCount} selected`}
      </span>
      {onSelectPage && (
        <button
          className={styles.selectAction}
          onClick={onSelectPage}
          title="Select every title on this page"
        >
          Select page
        </button>
      )}
      <button
        className={styles.selectAction}
        onClick={onClear}
        disabled={selectedCount === 0}
        title="Clear the current selection"
      >
        Clear
      </button>
      {confirming ? (
        <>
          <button
            className={styles.selectRemove}
            onClick={onConfirmRemove}
            title={`Remove ${selectedCount} selected ${selectedCount === 1 ? "title" : "titles"}`}
          >
            Confirm remove ({selectedCount})
          </button>
          <button
            className={styles.selectAction}
            onClick={onKeep}
            title="Keep the selected titles"
          >
            Keep
          </button>
        </>
      ) : (
        <button
          className={styles.selectRemove}
          onClick={onRequestRemove}
          disabled={selectedCount === 0}
          title="Remove the selected titles"
        >
          Remove selected
          {selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
      )}
    </div>
  );
}
