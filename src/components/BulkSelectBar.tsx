import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

  return (
    <div className={styles.selectBar} role="toolbar" aria-label={t("bulkSelect.toolbar")}>
      <span className={styles.selectCount} role="status">
        {selectedCount === 0
          ? t("bulkSelect.none")
          : t("bulkSelect.selected", { count: selectedCount })}
      </span>
      {onSelectPage && (
        <button
          className={styles.selectAction}
          onClick={onSelectPage}
          title={t("bulkSelect.selectPageTitle")}
        >
          {t("bulkSelect.selectPage")}
        </button>
      )}
      <button
        className={styles.selectAction}
        onClick={onClear}
        disabled={selectedCount === 0}
        title={t("bulkSelect.clearTitle")}
      >
        {t("common.clear")}
      </button>
      {confirming ? (
        <>
          <button
            className={styles.selectRemove}
            onClick={onConfirmRemove}
            title={t("bulkSelect.confirmRemoveTitle", { count: selectedCount })}
          >
            {t("bulkSelect.confirmRemove", { count: selectedCount })}
          </button>
          <button
            className={styles.selectAction}
            onClick={onKeep}
            title={t("bulkSelect.keepTitle")}
          >
            {t("bulkSelect.keep")}
          </button>
        </>
      ) : (
        <button
          className={styles.selectRemove}
          onClick={onRequestRemove}
          disabled={selectedCount === 0}
          title={t("bulkSelect.removeSelectedTitle")}
        >
          {selectedCount > 0
            ? t("bulkSelect.removeSelectedWithCount", { count: selectedCount })
            : t("bulkSelect.removeSelected")}
        </button>
      )}
    </div>
  );
}
