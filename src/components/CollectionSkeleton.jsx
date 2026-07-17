export default function CollectionSkeleton({ variant = 'grid', count = 4 }) {
  if (variant === 'history') {
    return (
      <div className="last-seen-groups">
        {Array.from({ length: count }, (_, index) => (
          <article key={index} className="last-seen-series skeleton-card">
            <div className="last-seen-series-head">
              <div className="last-seen-series-title-wrap">
                <div className="skeleton-avatar" />
                <div className="skeleton-series-copy">
                  <div className="skeleton-line skeleton-line-title" />
                  <div className="skeleton-line skeleton-line-subtitle" />
                </div>
              </div>
              <div className="skeleton-pill" />
            </div>

            <div className="last-seen-episode-list">
              <div className="skeleton-row" />
              <div className="skeleton-row" />
              <div className="skeleton-row" />
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="media-grid">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="media-card skeleton-card">
          <div className="media-card-poster">
            <div className="media-card-skeleton" />
          </div>
          <div className="media-card-info">
            <div className="skeleton-text skeleton-title" />
            <div className="skeleton-text skeleton-year" />
          </div>
          <div className="skeleton-button-bar" />
        </div>
      ))}
    </div>
  );
}