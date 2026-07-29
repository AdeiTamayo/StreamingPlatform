import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getWatchLater, removeWatchLater, getEpisodeWatchLater, removeEpisodeWatchLater } from '../api/storage';
import { imageUrl, getMovieDetail, getTVDetail, getSeasonDetails } from '../api/tmdb';
import CollectionSkeleton from '../components/CollectionSkeleton';
import FilterDropdown from '../components/FilterDropdown';
import { useToast } from '../components/useToast';
import styles from './WatchLater.module.css';

interface CalendarItem {
  date: string;
  title: string;
  type: 'movie' | 'episode';
  id: string | number;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  poster?: string;
}

function isFuture(dateStr: string) {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d >= new Date();
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function shortTitle(title: string, max = 12) {
  return title.length > max ? title.slice(0, max) + '\u2026' : title;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(d);
  return grid;
}

export default function WatchLater() {
  const [items, setItems] = useState([]);
  const [epItems, setEpItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingCalendar, setLoadingCalendar] = useState(true);
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [sortBy, setSortBy] = useState('recent');
  const [filterType, setFilterType] = useState('all');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [upcomingPage, setUpcomingPage] = useState(0);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 12;
  const DAYS_PER_PAGE = 3;
  const toast = useToast();

  const fetchTVFutureEpisodes = useCallback(async (id: string | number): Promise<CalendarItem[]> => {
    const results: CalendarItem[] = [];
    try {
      const detail = await getTVDetail(id);
      if (!detail) return results;
      const now = new Date();
      const seasons = (detail.seasons || []).filter((s) => s.season_number > 0);

      for (const season of seasons) {
        if (!season.air_date) continue;
        const seasonStart = new Date(season.air_date);

        if (seasonStart > now) {
          continue;
        }

        try {
          const seasonDetail = await getSeasonDetails(id, season.season_number);
          const episodes = seasonDetail?.episodes || [];
          for (const ep of episodes) {
            if (ep.air_date && isFuture(ep.air_date)) {
              results.push({
                date: ep.air_date,
                title: detail.name,
                type: 'episode',
                id,
                season: season.season_number,
                episode: ep.episode_number,
                episodeTitle: ep.name,
              });
            }
          }
        } catch {}
      }

      if (detail.next_episode_to_air?.air_date && isFuture(detail.next_episode_to_air.air_date)) {
        const n = detail.next_episode_to_air;
        const dup = results.some((r) => r.season === n.season_number && r.episode === n.episode_number && r.date === n.air_date);
        if (!dup) {
          results.push({
            date: n.air_date,
            title: detail.name,
            type: 'episode',
            id,
            season: n.season_number,
            episode: n.episode_number,
            episodeTitle: n.name,
          });
        }
      }
    } catch {}
    return results;
  }, []);

  const fetchMovieRelease = useCallback(async (item: any): Promise<CalendarItem | null> => {
    try {
      const detail = await getMovieDetail(item.id);
      if (detail?.release_date && isFuture(detail.release_date)) {
        return {
          date: detail.release_date,
          title: detail.title,
          type: 'movie',
          id: item.id,
          poster: detail.poster_path,
        };
      }
    } catch {}
    return null;
  }, []);

  const loadCalendarItems = useCallback(async () => {
    setLoadingCalendar(true);
    const wlItems = getWatchLater();
    const epwlItems = getEpisodeWatchLater();
    const results: CalendarItem[] = [];
    const CONCURRENCY = 3;

    for (let i = 0; i < wlItems.length; i += CONCURRENCY) {
      const batch = wlItems.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(batch.map(async (item) => {
        if (item.type === 'movie') return fetchMovieRelease(item);
        return fetchTVFutureEpisodes(item.id);
      }));
      for (const r of batchResults) {
        if (r.status === 'fulfilled') {
          const val = r.value;
          if (val && Array.isArray(val)) results.push(...val);
          else if (val) results.push(val);
        }
      }
    }

    for (let i = 0; i < epwlItems.length; i += CONCURRENCY) {
      const batch = epwlItems.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(batch.map(async (epwl) => {
        try {
          const season = await getSeasonDetails(epwl.showId, epwl.season);
          const ep = season?.episodes?.find((e) => e.episode_number === epwl.episode);
          if (ep?.air_date && isFuture(ep.air_date)) {
            return {
              date: ep.air_date,
              title: epwl.showTitle,
              type: 'episode' as const,
              id: epwl.showId,
              season: epwl.season,
              episode: epwl.episode,
              episodeTitle: ep.name,
            };
          }
        } catch {}
        return null;
      }));
      for (const r of batchResults) {
        if (r.status === 'fulfilled' && r.value) results.push(r.value);
      }
    }

    results.sort((a, b) => a.date.localeCompare(b.date));
    setCalendarItems(results);
    setLoadingCalendar(false);
  }, [fetchTVFutureEpisodes, fetchMovieRelease]);

  useEffect(() => {
    document.title = 'Watch Later - StreamFlow';
    setItems(getWatchLater());
    setEpItems(getEpisodeWatchLater());
    setLoading(false);
    loadCalendarItems();
  }, [loadCalendarItems]);

  useEffect(() => {
    if (calendarItems.length > 0 && view === 'calendar') {
      const firstDate = calendarItems[0].date;
      const d = new Date(firstDate);
      setCalYear(d.getFullYear());
      setCalMonth(d.getMonth());
      setSelectedDate(firstDate);
    }
  }, [calendarItems, view]);

  function handleRemove(type, id) {
    removeWatchLater(type, id);
    setItems(getWatchLater());
    loadCalendarItems();
    toast('Removed from Watch Later');
  }

  function handleRemoveEp(showId, season, episode) {
    removeEpisodeWatchLater(showId, season, episode);
    setEpItems(getEpisodeWatchLater());
    loadCalendarItems();
    toast('Removed from Watch Later');
  }

  const itemsByDate = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {};
    for (const item of calendarItems) {
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
    }
    return map;
  }, [calendarItems]);

  const sortedItems = useMemo(() => {
    let list = [...items];
    if (filterType === 'movies') list = list.filter((i) => i.type === 'movie');
    else if (filterType === 'tv') list = list.filter((i) => i.type === 'tv');
    if (sortBy === 'title') list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else if (sortBy === 'year') list.sort((a, b) => (b.year || '0').localeCompare(a.year || '0'));
    else list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    return list;
  }, [items, sortBy, filterType]);

  const daysGrid = useMemo(() => getMonthDays(calYear, calMonth), [calYear, calMonth]);
  const todayStr = new Date().toISOString().slice(0, 10);

  function dateStr(y: number, m: number, d: number | null) {
    if (d === null) return '';
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function prevMonth() {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
  }

  function nextMonth() {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
  }

  const selectedItems = selectedDate ? itemsByDate[selectedDate] || [] : [];

  const groupedUpcomingList = useMemo(() => {
    const groups: { date: string; items: CalendarItem[] }[] = [];
    for (const item of calendarItems) {
      const last = groups[groups.length - 1];
      if (last && last.date === item.date) last.items.push(item);
      else groups.push({ date: item.date, items: [item] });
    }
    return groups;
  }, [calendarItems]);

  const totalPages = Math.max(1, Math.ceil(groupedUpcomingList.length / DAYS_PER_PAGE));
  const paginatedGroups = useMemo(() => {
    const start = upcomingPage * DAYS_PER_PAGE;
    return groupedUpcomingList.slice(start, start + DAYS_PER_PAGE);
  }, [groupedUpcomingList, upcomingPage, DAYS_PER_PAGE]);

  useEffect(() => {
    if (upcomingPage >= totalPages) setUpcomingPage(Math.max(0, totalPages - 1));
  }, [totalPages, upcomingPage]);

  if (view === 'calendar') {
    const maxNamesPerCell = 3;
    return (
      <div className="page">
        <section className="section">
          <div className={styles.calViewHeader}>
            <h2 className="section-title" style={{ margin: 0 }}>Calendar</h2>
            <button className={styles.viewToggle} onClick={() => setView('list')}>Back to list</button>
          </div>
          <div className={styles.calViewLayout}>
            <div className={styles.calViewGrid}>
              <div className={styles.calendarHeader}>
                <button className={styles.calNav} onClick={prevMonth} aria-label="Previous month">&lsaquo;</button>
                <span className={styles.calTitle}>{MONTHS[calMonth]} {calYear}</span>
                <button className={styles.calNav} onClick={nextMonth} aria-label="Next month">&rsaquo;</button>
              </div>
              <div className={styles.calGrid}>
                {WEEKDAYS.map((wd) => (
                  <div key={wd} className={styles.calWeekday}>{wd}</div>
                ))}
                {daysGrid.map((day, idx) => {
                  const ds = dateStr(calYear, calMonth, day);
                  const dayItems = day ? itemsByDate[ds] || [] : [];
                  const isToday = ds === todayStr;
                  return (
                    <button
                      key={idx}
                      className={`${styles.calDay} ${day === null ? styles.calDayEmpty : ''} ${isToday ? styles.calDayToday : ''} ${selectedDate === ds ? styles.calDaySelected : ''}`}
                      disabled={day === null}
                      onClick={() => day !== null && setSelectedDate(ds)}
                      aria-label={day ? `${MONTHS[calMonth]} ${day}, ${dayItems.length} items` : ''}
                    >
                      {day !== null && (
                        <>
                          <span className={styles.calDayNum}>{day}</span>
                          {dayItems.length > 0 && (
                            <div className={styles.calDayNames}>
                              {dayItems.slice(0, maxNamesPerCell).map((item, i) => (
                                <span key={i} className={styles.calDayName}>
                                  {shortTitle(item.title)}
                                </span>
                              ))}
                              {dayItems.length > maxNamesPerCell && (
                                <span className={styles.calDayMore}>+{dayItems.length - maxNamesPerCell} more</span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className={styles.calViewSidebar}>
              {selectedItems.length > 0 ? (
                <>
                  <div className={styles.calSidebarTitle}>{formatDate(selectedDate!)}</div>
                  {selectedItems.map((item, idx) => (
                    <div key={`${item.date}-${item.type}-${item.id}-S${item.season}E${item.episode}-${idx}`} className={styles.calSidebarItem}>
                      {item.poster && (
                        <img src={imageUrl(item.poster, 'w92')} alt="" className={styles.calItemPoster} />
                      )}
                      <div className={styles.calItemInfo}>
                        <div className={styles.calItemTitle}>{item.title}</div>
                        <div className={styles.calItemDetail}>
                          {item.type === 'movie' ? 'Movie' : `S${item.season} E${item.episode ?? '\u2014'}`}
                          {item.episodeTitle && <span> &middot; {item.episodeTitle}</span>}
                        </div>
                      </div>
                      <Link
                        to={item.type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}?season=${item.season}&episode=${item.episode}`}
                        className={styles.calItemOpen}
                      >
                        Open
                      </Link>
                    </div>
                  ))}
                </>
              ) : (
                <div className={styles.calSidebarEmpty}>
                  {selectedDate ? 'Nothing scheduled this day' : 'Select a day to see releases'}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="section">
        <h2 className="section-title">Watch Later</h2>

        {loading ? (
          <CollectionSkeleton variant="grid" count={6} />
        ) : items.length === 0 && epItems.length === 0 ? (
          <div className="empty-state">
            <h3>Nothing saved yet</h3>
            <p>Add movies, shows, or individual episodes to watch later and they'll show up here.</p>
            <Link to="/movies" className="empty-state-action">Start browsing</Link>
          </div>
        ) : (
          <>
            {items.length > 0 && (
              <>
                <div className={styles.wlControls}>
                  <FilterDropdown
                    value={filterType}
                    options={[
                      { value: 'all', label: 'All types' },
                      { value: 'movies', label: 'Movies' },
                      { value: 'tv', label: 'TV Shows' },
                    ]}
                    placeholder="All types"
                    onSelect={(v) => { setFilterType(v); setPage(1); }}
                  />
                  <FilterDropdown
                    value={sortBy}
                    options={[
                      { value: 'recent', label: 'Most recent' },
                      { value: 'title', label: 'Title A-Z' },
                      { value: 'year', label: 'Year' },
                    ]}
                    placeholder="Sort by"
                    onSelect={(v) => { setSortBy(v); setPage(1); }}
                  />
                  {(filterType !== 'all' || sortBy !== 'recent') && (
                    <button className={styles.wlClearBtn} onClick={() => { setFilterType('all'); setSortBy('recent'); setPage(1); }}>Clear filters</button>
                  )}
                </div>
                <div className="media-grid">
                  {sortedItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE).map((item) => (
                    <div key={`${item.type}-${item.id}`} className="media-card">
                      <Link to={`/${item.type === 'tv' ? 'tv' : 'movie'}/${item.id}`}>
                        <div className="media-card-poster">
                          <img src={item.poster || imageUrl(null)} alt={item.title} loading="lazy" />
                          <span className={`media-card-type ${item.type}`}>{item.type === 'tv' ? 'TV' : 'Movie'}</span>
                        </div>
                        <div className="media-card-info">
                          <h3>{item.title}</h3>
                          {item.year && <span className="media-card-year">{item.year}</span>}
                        </div>
                      </Link>
                      <button className="wl-remove" onClick={() => handleRemove(item.type, item.id)} title="Remove">&times;</button>
                    </div>
                  ))}
                </div>
                {Math.ceil(sortedItems.length / ITEMS_PER_PAGE) > 1 && (
                  <div className="pagination">
                    <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                    <span>Page {page} of {Math.ceil(sortedItems.length / ITEMS_PER_PAGE)}</span>
                    <button disabled={page >= Math.ceil(sortedItems.length / ITEMS_PER_PAGE)} onClick={() => setPage((p) => p + 1)}>Next</button>
                  </div>
                )}
              </>
            )}
            {epItems.length > 0 && (
              <>
                <h3 className="sub-section-title">Episodes</h3>
                <div className="media-grid">
                  {epItems.map((item) => (
                    <div key={`${item.showId}-S${item.season}E${item.episode}`} className={`media-card ${styles.epWlCard}`}>
                      <Link to={`/tv/${item.showId}?season=${item.season}&episode=${item.episode}`}>
                        <div className="media-card-info">
                          <h3>{item.showTitle}</h3>
                          <span className="media-card-year">S{item.season} E{item.episode}</span>
                        </div>
                      </Link>
                      <button className="wl-remove" onClick={() => handleRemoveEp(item.showId, item.season, item.episode)} title="Remove">&times;</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {!loadingCalendar && calendarItems.length > 0 && (
          <div className={styles.upcomingBanner}>
            <button className={styles.upcomingToggle} onClick={() => setShowUpcoming((v) => !v)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span className={styles.upcomingToggleLabel}>{calendarItems.length} upcoming</span>
              <span className={styles.upcomingToggleArrow}>{showUpcoming ? '\u25B2' : '\u25BC'}</span>
            </button>
            <button className={styles.calIconBtn} onClick={() => setView('calendar')} aria-label="View full calendar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
          </div>
        )}

        {showUpcoming && loadingCalendar && (items.length > 0 || epItems.length > 0) && (
          <div className={styles.upcomingList}>
            <div className={styles.skeletonLine} style={{ width: '40%', height: '0.8rem', marginBottom: '0.75rem' }} />
            <div className={styles.skeletonLine} style={{ width: '30%', height: '0.7rem', marginBottom: '0.5rem' }} />
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonRow} />
          </div>
        )}

        {showUpcoming && !loadingCalendar && calendarItems.length > 0 && (
          <div className={styles.upcomingList}>
            {paginatedGroups.map((group) => (
              <div key={group.date} className={styles.upcomingDateGroup}>
                <div className={styles.upcomingDateLabel}>{formatDate(group.date)}</div>
                {group.items.map((item, idx) => (
                  <div key={`${item.date}-${item.type}-${item.id}-S${item.season}E${item.episode}-${idx}`} className={styles.upcomingItem}>
                    <div className={styles.upcomingItemInfo}>
                      <div className={styles.upcomingItemTitle}>{item.title}</div>
                      <div className={styles.upcomingItemDetail}>
                        {item.type === 'movie' ? 'Movie' : `S${item.season} E${item.episode ?? '\u2014'}`}
                        {item.episodeTitle && <span> &middot; {item.episodeTitle}</span>}
                      </div>
                    </div>
                    <Link
                      to={item.type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}?season=${item.season}&episode=${item.episode}`}
                      className={styles.upcomingItemOpen}
                    >
                      Open
                    </Link>
                  </div>
                ))}
              </div>
            ))}
            {totalPages > 1 && (
              <div className={styles.upcomingPagination}>
                <button
                  className={styles.pageBtn}
                  disabled={upcomingPage <= 0}
                  onClick={() => setUpcomingPage((p) => Math.max(0, p - 1))}
                >
                  &lsaquo; Prev
                </button>
                <span className={styles.pageInfo}>
                  {upcomingPage + 1} / {totalPages}
                </span>
                <button
                  className={styles.pageBtn}
                  disabled={upcomingPage >= totalPages - 1}
                  onClick={() => setUpcomingPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  Next &rsaquo;
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
