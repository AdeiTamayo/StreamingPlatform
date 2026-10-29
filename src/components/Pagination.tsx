import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

const Pagination = ({ page, totalPages, onChange, label, className, style }: PaginationProps) => {
  const { t } = useTranslation();
  const [goTo, setGoTo] = useState('');

  // Clear the "Go to" field whenever the page changes from any source
  // (Prev/Next, the go form, or an external reset) so it never shows a stale
  // value that no longer matches the rendered page.
  useEffect(() => {
    setGoTo('');
  }, [page]);

  // Nothing to paginate - don't render "Page 1 of 0".
  if (!Number.isFinite(totalPages) || totalPages < 1) return null;
  const safePage = Math.min(Math.max(1, page), totalPages);

  function handleGo(e: React.FormEvent) {
    e.preventDefault();
    const target = parseInt(goTo, 10);
    if (!Number.isNaN(target)) {
      onChange(Math.min(Math.max(target, 1), totalPages));
    }
    setGoTo('');
  }

  return (
    <nav className={`pagination${className ? ` ${className}` : ''}`} style={style} aria-label={t('pagination.label')}>
      <button type="button" disabled={safePage <= 1} onClick={() => onChange(safePage - 1)} aria-label={t('pagination.previousPage')}>{t('pagination.prev')}</button>
      <span aria-current="page" role="status" aria-live="polite">{label ?? t('pagination.pageOf', { page: safePage, total: totalPages })}</span>
      <button type="button" disabled={safePage >= totalPages} onClick={() => onChange(safePage + 1)} aria-label={t('pagination.nextPage')}>{t('pagination.next')}</button>
      <form className="pagination-go" onSubmit={handleGo}>
        <input
          className="pagination-input"
          type="number"
          min={1}
          max={totalPages}
          value={goTo}
          placeholder={t('pagination.goTo')}
          aria-label={t('pagination.goToPage')}
          onChange={(e) => setGoTo(e.target.value)}
        />
        <button type="submit" disabled={!goTo.trim()}>{t('pagination.go')}</button>
      </form>
    </nav>
  );
};

export default Pagination;
