import { useState } from 'react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

const Pagination = ({ page, totalPages, onChange, label, className, style }: PaginationProps) => {
  const [goTo, setGoTo] = useState('');

  // Nothing to paginate - don't render "Page 1 of 0".
  if (!Number.isFinite(totalPages) || totalPages < 1) return null;
  const safePage = Math.min(Math.max(1, page), totalPages);

  function handleGo(e: React.FormEvent) {
    e.preventDefault();
    const target = parseInt(goTo, 10);
    if (!Number.isNaN(target)) {
      onChange(Math.min(Math.max(target, 1), totalPages));
      setGoTo('');
    }
  }

  return (
    <div className={`pagination${className ? ` ${className}` : ''}`} style={style}>
      <button disabled={safePage <= 1} onClick={() => onChange(safePage - 1)} aria-label="Previous page">Prev</button>
      <span>{label ?? `Page ${safePage} of ${totalPages}`}</span>
      <button disabled={safePage >= totalPages} onClick={() => onChange(safePage + 1)} aria-label="Next page">Next</button>
      <form className="pagination-go" onSubmit={handleGo}>
        <input
          className="pagination-input"
          type="number"
          min={1}
          max={totalPages}
          value={goTo}
          placeholder="Go to"
          aria-label="Go to page"
          onChange={(e) => setGoTo(e.target.value)}
        />
        <button type="submit" disabled={!goTo.trim()}>Go</button>
      </form>
    </div>
  );
};

export default Pagination;