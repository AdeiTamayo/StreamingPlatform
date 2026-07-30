import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getTVDetail, getSeasonDetails, imageUrl } from '../api/tmdb';
import { getTVEmbedUrl, getSourceLabel, SOURCE_KEYS } from '../api/vidsrc';
import { isWatched, markWatched, markUnwatched, getLastWatchedEpisode, saveProgress, getProgress, clearProgress, isInWatchLater, addWatchLater, removeWatchLater, getWatchedCount, isInEpisodeWatchLater, addEpisodeWatchLater, removeEpisodeWatchLater, markSeasonWatched, markAllSeasonsWatched, unmarkAllSeasonsWatched, getVideoSource, getEpisodeWatchLater, isAlreadyNotified, addNotification, getWatchedEpisodeSet } from '../api/storage';
import Player from '../components/Player';
import EpisodeDropdown from '../components/EpisodeDropdown';
import SeasonDropdown from '../components/SeasonDropdown';
import FilterDropdown from '../components/FilterDropdown';
import MediaCard from '../components/MediaCard';
import { useToast } from '../components/useToast';
import { useAbortController } from '../hooks/useAbortController';
import { logDebug } from '../utils/logger';
import type { TMDBSeries, TMDBMovie, TMDBSeason, TMDBEpisode, TMDBVideo, EpisodeWatchLaterItem } from '../types';
import styles from './TVDetail.module.css';

const AUTO_WATCH_REMAINING_SECONDS = 5 * 60;

const EpisodeDot = memo(function EpisodeDot({ ep, current, done, onClick }: { ep: number; current: boolean; done: boolean; onClick: (ep: number) => void }) {
  return (
    <button
      role="listitem"
      className={`${styles.spDot} ${current ? styles.current : ''} ${done ? styles.done : ''}`}
      onClick={() => onClick(ep)}
      title={`Episode ${ep}`}
    />
  );
});

export default function TVDetail() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const urlSeason = searchParams.get('season');
  const urlEpisode = searchParams.get('episode');
  const [show, setShow] = useState<TMDBSeries | null>(null);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [watched, setWatched] = useState(false);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [inWL, setInWL] = useState(false);
  const [inEpWL, setInEpWL] = useState(false);
  const [watchedCount, setWatchedCount] = useState(0);
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [videoSource, setVideoSource] = useState(getVideoSource());
  const [playerOpen, setPlayerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const watchedRef = useRef(false);
  const autoWatchedRef = useRef<string | null>(null);
  const { getSignal } = useAbortController();

  const seasons: TMDBSeason[] = useMemo(() => show?.seasons?.filter((s) => s.season_number > 0) || [], [show]);
  const currentSeason = useMemo(() => seasons.find((s) => s.season_number === season), [seasons, season]);
  const episodeCount = currentSeason?.episode_count || 12;
  const seasonIdx = seasons.findIndex((s) => s.season_number === season);
  const hasPrev = episode > 1 || seasonIdx > 0;
  const episodeNums = useMemo(() => Array.from({ length: episodeCount }, (_, i) => i + 1), [episodeCount]);
  const watchedStates = useMemo(() => {
    const set = getWatchedEpisodeSet('tv', id!, season, episodeCount);
    const map: Record<number, boolean> = {};
    episodeNums.forEach((ep) => { map[ep] = set.has(ep); });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeNums, id, season, watchedCount, episodeCount]);

  function allWatched(): boolean {
    if (!id) return false;
    return seasons.length > 0 && seasons.every(s => getWatchedCount(id, s.season_number, s.episode_count) >= s.episode_count);
  }

  const hasNext = episode < episodeCount || seasonIdx < seasons.length - 1;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(false);
    watchedRef.current = false;
    autoWatchedRef.current = null;
    setTrailerKey(null);
    setShowTrailer(false);
    getTVDetail(id, getSignal())
      .then((data) => {
        const showData = data as TMDBSeries;
        setShow(showData);
        document.title = `${showData.name} - StreamFlow`;
        setInWL(isInWatchLater('tv', id));
        const vids = showData.videos?.results || [];
        const yt = vids.find((v: TMDBVideo) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
        if (yt) setTrailerKey(yt.key);
        const s: TMDBSeason[] = showData.seasons?.filter((s: TMDBSeason) => s.season_number > 0) || [];
        if (s.length === 0) return;
        const firstSeason = s[0].season_number;
        const requestedSeason = Number(urlSeason);
        const requestedEpisode = Number(urlEpisode);
        const requestedSeasonExists = requestedSeason > 0 && s.some((seasonItem: TMDBSeason) => seasonItem.season_number === requestedSeason);
        const last = getLastWatchedEpisode(id);
        if (requestedSeasonExists && requestedEpisode > 0) {
          setSeason(requestedSeason);
          setEpisode(requestedEpisode);
          setPlayerOpen(true);
        } else if (last && s.find((seasonItem: TMDBSeason) => seasonItem.season_number === last.season)) {
          setSeason(last.season);
          setEpisode(last.episode);
        } else {
          setSeason(firstSeason);
          setEpisode(1);
        }
      })
      .catch((err: Error) => {
        if (err?.name === 'AbortError') return;
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [id, urlSeason, urlEpisode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return;
    setWatched(isWatched('tv', id, season, episode));
    setInEpWL(isInEpisodeWatchLater(id, season, episode));
    const prog = getProgress('tv', id, season, episode);
    setStartAt(prog?.currentTime || null);
    watchedRef.current = isWatched('tv', id, season, episode);
    autoWatchedRef.current = null;
  }, [id, season, episode]);

  useEffect(() => {
    watchedRef.current = watched;
  }, [watched]);

  useEffect(() => {
    autoWatchedRef.current = null;
  }, [season, episode]);

  useEffect(() => {
    if (!id) return;
    setWatchedCount(getWatchedCount(id, season, episodeCount));
  }, [id, season, episodeCount, watched]);

  useEffect(() => {
    if (!id) return;
    getSeasonDetails(id, season, getSignal()).then((data) => {
      setEpisodes((data as { episodes: TMDBEpisode[] }).episodes || []);
    }).catch(() => { });
  }, [id, season]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check for new episodes of watch-later shows
  useEffect(() => {
    if (!show || !id) return;
    let cancelled = false;

    (async () => {
      const now = new Date();
      let added = 0;

      if (inWL) {
        const latestSeason = seasons[seasons.length - 1];
        if (latestSeason) {
          try {
            const data = await getSeasonDetails(id, latestSeason.season_number, getSignal());
            if (cancelled) return;
            const eps = (data as { episodes: TMDBEpisode[] }).episodes || [];
            for (const ep of eps) {
              if (added >= 5) break;
              if (!ep.air_date) continue;
              if (new Date(ep.air_date) > now) continue;
              if (isWatched('tv', id, latestSeason.season_number, ep.episode_number)) continue;
              if (isAlreadyNotified(id, latestSeason.season_number, ep.episode_number)) continue;
              addNotification(id, show.name, latestSeason.season_number, ep.episode_number, ep.name, 'new_episode', ep.air_date);
              added++;
            }
          } catch {}
        }
      }

      const epwlItems: EpisodeWatchLaterItem[] = getEpisodeWatchLater().filter((item: EpisodeWatchLaterItem) => String(item.showId) === String(id));
      if (epwlItems.length > 0) {
        const seasonsToCheck = [...new Set(epwlItems.map((item: EpisodeWatchLaterItem) => item.season))];
        for (const seasonNum of seasonsToCheck) {
          if (added >= 5) break;
          try {
            const data = await getSeasonDetails(id, seasonNum, getSignal());
            if (cancelled) return;
            const eps = (data as { episodes: TMDBEpisode[] }).episodes || [];
            for (const epwl of epwlItems) {
              if (added >= 5) break;
              if (epwl.season !== seasonNum) continue;
              const ep = eps.find((e: TMDBEpisode) => e.episode_number === epwl.episode);
              if (!ep || !ep.air_date) continue;
              if (new Date(ep.air_date) > now) continue;
              if (isWatched('tv', id, seasonNum, epwl.episode)) continue;
              if (isAlreadyNotified(id, seasonNum, epwl.episode)) continue;
              addNotification(id, show.name, seasonNum, epwl.episode, ep.name || `Episode ${epwl.episode}`, 'new_episode', ep.air_date);
              added++;
            }
          } catch {}
        }
      }
    })();

    return () => { cancelled = true; };
  }, [show, inWL]); // eslint-disable-line react-hooks/exhaustive-deps

  function autoMarkWatched() {
    const episodeKey = `${season}-${episode}`;
    if (!show || !id || watchedRef.current || autoWatchedRef.current === episodeKey) return;
    autoWatchedRef.current = episodeKey;
    markWatched('tv', id, show.name, season, episode, { title: show.name, poster: show?.poster_path });
    clearProgress('tv', id, season, episode);
    watchedRef.current = true;
    setWatched(true);
    setStartAt(null);
  }

  function handleProgress(currentTime: number, duration: number) {
    if (watchedRef.current || !show || !id) return;
    saveProgress('tv', id, currentTime, season, episode, { title: show?.name, poster: show?.poster_path });

    const currentEpisode = episodes.find((item) => item.episode_number === episode);
    const tmdbRuntime = currentEpisode?.runtime || show.episode_run_time?.[0] || null;
    const runtimeSeconds = duration || (tmdbRuntime ? tmdbRuntime * 60 : null);

    logDebug(`autoWatch check: currentTime=${currentTime} duration=${duration} tmdbRuntime=${tmdbRuntime} runtimeSeconds=${runtimeSeconds} episodesLoaded=${episodes.length}`);

    if (!runtimeSeconds) return;

    const autoWatchThreshold = Math.min(runtimeSeconds * 0.9, runtimeSeconds - AUTO_WATCH_REMAINING_SECONDS);

    if (autoWatchThreshold > 0 && currentTime >= autoWatchThreshold) {
      autoMarkWatched();
    }
  }

  function handleEnded() {
    autoMarkWatched();
  }

  const safeId = id!;

  function toggleWatched() {
    if (!show || !id) return;
    if (watched) {
      markUnwatched('tv', id, season, episode);
      clearProgress('tv', id, season, episode);
      setWatched(false);
      toast?.('Removed from watched');
    } else {
      markWatched('tv', id, show.name, season, episode, { title: show.name, poster: show?.poster_path });
      clearProgress('tv', id, season, episode);
      setWatched(true);
      toast?.('Marked as watched');
    }
  }

  function goPrev() {
    if (episode > 1) {
      setEpisode(episode - 1);
    } else if (seasonIdx > 0) {
      const prevSeason = seasons[seasonIdx - 1];
      setSeason(prevSeason.season_number);
      setEpisode(prevSeason.episode_count || 12);
    }
  }

  function markCurrentWatched() {
    if (watchedRef.current || !show || !id) return;
    markWatched('tv', id, show.name, season, episode, { title: show.name, poster: show?.poster_path });
    clearProgress('tv', id, season, episode);
    watchedRef.current = true;
    setWatched(true);
  }

  function goNext() {
    markCurrentWatched();
    if (episode < episodeCount) {
      setEpisode(episode + 1);
    } else if (seasonIdx < seasons.length - 1) {
      setSeason(seasons[seasonIdx + 1].season_number);
      setEpisode(1);
    }
  }

  function retry() {
    if (!id) return;
    setLoading(true);
    setError(false);
    getTVDetail(id, getSignal()).then((data) => { setShow(data as TMDBSeries); }).catch((err: Error) => { if (err?.name !== 'AbortError') setError(true); }).finally(() => setLoading(false));
  }

  if (loading) return <div className="page"><div className="loading" role="status">Loading...</div></div>;

  if (error) return (
    <div className="page" role="alert">
      <div className="loading">Failed to load. Check your connection.</div>
      <div className="retry-bar"><button className="watch-toggle" onClick={retry}>Retry</button></div>
    </div>
  );
  if (!show) return <div className="page"><div className="loading">Show not found</div></div>;

  const embedUrl = getTVEmbedUrl(safeId, season, episode, videoSource);
  const backdrop = imageUrl(show.backdrop_path, 'original');
  const year = (show.first_air_date || '').slice(0, 4);
  const ended = show.status === 'Ended';
  const endYear = ended && show.last_air_date ? show.last_air_date.slice(0, 4) : null;
  const cast = show.credits?.cast?.slice(0, 8) || [];
  const created = show.created_by || [];
  const networks = show.networks || [];
  const genres = show.genres?.map((g) => g.name).join(', ') || '';
  const recommendations = show.recommendations?.results?.slice(0, 10) || [];

  return (
    <div className="page">
      <div className="detail-header" style={{ backgroundImage: `url(${backdrop})` }}>
        <div className="detail-header-overlay">
          <div className="detail-poster">
            <img src={imageUrl(show.poster_path)} alt={show.name} />
          </div>
          <div className="detail-meta">
            <h1>{show.name} <span className="year">({endYear ? `${year}-${endYear}` : year})</span></h1>
            <div className="detail-badges">
              <span className="badge rating">{show.vote_average?.toFixed(1)}</span>
              {genres && <span className="badge">{genres}</span>}
              <span className="badge">{seasons.length} Seasons</span>
              <button className={`badge-btn ${inWL ? 'in-wl' : ''}`} onClick={() => {
                if (inWL) { removeWatchLater('tv', safeId); setInWL(false); }
                else { addWatchLater('tv', safeId, show.name, year, imageUrl(show.poster_path)); setInWL(true); }
              }} title={inWL ? 'Remove from Watch Later' : 'Add to Watch Later'}>{inWL ? 'Saved' : '+ Watch'}</button>
            </div>
            <p className="detail-overview">{show.overview}</p>
            {cast.length > 0 && (
              <div className="detail-cast"><strong>Cast:</strong> {cast.map((c) => c.name).join(', ')}</div>
            )}
            {created.length > 0 && (
              <div className="detail-crew"><strong>Created by:</strong> {created.map((c) => c.name).join(', ')}</div>
            )}
            {networks.length > 0 && (
              <div className="detail-crew"><strong>Network:</strong> {networks.map((n) => n.name).join(', ')}</div>
            )}
          </div>
        </div>
      </div>

      {playerOpen ? (
        <section className="section" aria-labelledby="watch-heading-tv">
          <h2 id="watch-heading-tv" className="section-title">Watch Now</h2>
          <div className="episode-selector">
            <label>
              Season:
              <SeasonDropdown
                seasons={seasons}
                value={season}
                onSelect={(s: number) => { setSeason(s); setEpisode(1); }}
              />
            </label>
            <label>
                <EpisodeDropdown
                showId={safeId}
                season={season}
                episode={episode}
                episodes={episodes}
                onSelect={(ep: number) => { setEpisode(ep); }}
              />
            </label>
            <button className={`watch-toggle ${watched ? 'watched' : ''}`} onClick={toggleWatched}>
              {watched ? 'Watched' : 'Mark as watched'}
            </button>
            <button className={`watch-toggle ${inEpWL ? 'in-wl' : ''}`} onClick={() => {
              if (inEpWL) { removeEpisodeWatchLater(safeId, season, episode); setInEpWL(false); }
              else { addEpisodeWatchLater(safeId, season, episode, show.name); setInEpWL(true); }
            }}>{inEpWL ? 'Saved' : 'Watch Later'}</button>
            {trailerKey && (
              <button className="watch-toggle"           onClick={() => setShowTrailer((s: boolean) => !s)}>
                {showTrailer ? 'Hide Trailer' : 'Trailer'}
              </button>
            )}
            {startAt && (
              <button className="watch-toggle restart-btn" onClick={() => { setStartAt(null); clearProgress('tv', safeId, season, episode); }}>
                Restart
              </button>
            )}
          </div>
          <div className={styles.seasonProgress}>
            <div className={styles.spHeader}>
              <span className={styles.spLabel}>Season {season}</span>
              <span className={styles.spCount}>{watchedCount}/{episodeCount} watched</span>
              {watchedCount < episodeCount && (
                <button className={styles.markSeasonBtn} onClick={() => {
                  markSeasonWatched(safeId, season, episodeCount, show.name, show?.poster_path ?? '');
                  setWatchedCount(getWatchedCount(safeId, season, episodeCount));
                  setWatched(isWatched('tv', safeId, season, episode));
                  toast?.('Season marked as watched');
                }}>Mark season watched</button>
              )}
            </div>
            <div className={styles.spBar} role="list" aria-label="Episode progress">
              {episodeNums.map((ep) => (
                <EpisodeDot key={ep} ep={ep} current={ep === episode} done={watchedStates[ep]} onClick={setEpisode} />
              ))}
            </div>
          </div>
          {showTrailer && trailerKey ? (
            <div className="trailer-wrapper">
              <iframe
                src={`https://www.youtube.com/embed/${trailerKey}`}
                title="Trailer"
                allow="autoplay; fullscreen; encrypted-media"
                allowFullScreen
                className="player-iframe"
              />
            </div>
          ) : (
            <Player
              key={`${season}-${episode}-${startAt !== null ? 'resume' : 'fresh'}`}
              src={embedUrl}
              title={`${show.name} S${season}E${episode}`}
              onProgress={handleProgress}
              onEnded={handleEnded}
              runtimeMinutes={episodes.find((item) => item.episode_number === episode)?.runtime || show.episode_run_time?.[0] || null}
            />
          )}
          <div className={styles.epNav}>
            <div className={styles.epNavCenter}>
              <button className={styles.epNavBtn} disabled={!hasPrev} onClick={goPrev}>&#9664; Prev</button>
              <span className={styles.epNavLabel as string}>S{season} E{episode}</span>
              <button className={styles.epNavBtn} disabled={!hasNext} onClick={goNext}>Next &#9654;</button>
              <button className={`${styles.epNavWatch} ${watched ? styles.watched : ''}`} onClick={toggleWatched} title={watched ? 'Unmark watched' : 'Mark as watched'}>&#10003;</button>
            </div>
            <FilterDropdown
              value={videoSource}
              options={SOURCE_KEYS.map((key) => ({ value: key, label: getSourceLabel(key) }))}
              placeholder="Source"
              onSelect={(val: string) => setVideoSource(val)}
              className="source-dropdown"
            />
          </div>

          <div className={styles.episodeListToggle}>
            <button className="watch-toggle" onClick={() => setPlayerOpen(false)}>
              Back to episodes
            </button>
          </div>
        </section>
      ) : (
        <section className="section" aria-labelledby="episodes-heading">
          <div className={styles.browseHeader}>
            <h2 id="episodes-heading" className="section-title">Episodes</h2>
            <SeasonDropdown
              seasons={seasons}
              value={season}
              onSelect={(s: number) => { setSeason(s); setEpisode(1); }}
            />
            {!!id && (
              <button className={styles.markSeasonBtn} onClick={() => {
                if (allWatched()) {
                  unmarkAllSeasonsWatched(safeId, seasons);
                  toast?.('All episodes unmarked');
                } else {
                  markAllSeasonsWatched(safeId, seasons, show.name, show?.poster_path ?? '');
                  toast?.('All episodes marked as watched');
                }
                setWatchedCount(getWatchedCount(safeId, season, episodeCount));
                setWatched(isWatched('tv', safeId, season, episode));
                setRefreshKey(n => n + 1);
              }}>{allWatched() ? 'Unmark all watched' : 'Mark all watched'}</button>
            )}
          </div>
          <div className={styles.seasonProgress}>
            <div className={styles.spHeader}>
              <span className={styles.spLabel}>Season {season}</span>
              <span className={styles.spCount}>{watchedCount}/{episodeCount} watched</span>
              {watchedCount < episodeCount && !!id && (
                <button className={styles.markSeasonBtn} onClick={() => {
                  markSeasonWatched(safeId, season, episodeCount, show.name, show?.poster_path ?? '');
                  setWatchedCount(getWatchedCount(safeId, season, episodeCount));
                  setWatched(isWatched('tv', safeId, season, episode));
                  toast?.('Season marked as watched');
                }}>Mark season watched</button>
              )}
            </div>
            <div className={styles.spBar}>
              {episodeNums.map((ep) => (
                <EpisodeDot key={ep} ep={ep} current={false} done={watchedStates[ep]} onClick={(e: number) => { setEpisode(e); setPlayerOpen(true); }} />
              ))}
            </div>
          </div>
          {episodes.length > 0 && (
            <div className={styles.episodeList}>
              {episodes.map((ep) => (
                <div key={ep.episode_number} className={`${styles.episodeCard} ${ep.episode_number === episode ? styles.current : ''} ${watchedStates[ep.episode_number] ? styles.watched : ''}`} onClick={() => { setEpisode(ep.episode_number); setPlayerOpen(true); }}>
                  {ep.still_path && (
                    <div className={styles.episodeCardThumb}>
                      <img src={imageUrl(ep.still_path, 'w300')} alt={ep.name} loading="lazy" />
                    </div>
                  )}
                  <div className={styles.episodeCardInfo}>
                    <h4>E{ep.episode_number}. {ep.name}</h4>
                    <div className={styles.epMeta}>
                      {ep.air_date && <span>{ep.air_date}</span>}
                      {ep.runtime && <span> &middot; {ep.runtime}m</span>}
                      {ep.vote_average > 0 && <span> &middot; {ep.vote_average.toFixed(1)}</span>}
                    </div>
                    {ep.overview && <div className={styles.epOverview}>{ep.overview}</div>}
                  </div>
                  {watchedStates[ep.episode_number] && <span className={styles.epWatchedBadge}>&#10003;</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {recommendations.length > 0 && (
        <section className="section" aria-labelledby="recs-heading-tv">
          <h2 id="recs-heading-tv" className="section-title">You might also like</h2>
          <div className="media-grid">
            {recommendations.map((item) => (
              <MediaCard key={(item as { id: number }).id} item={item as TMDBMovie | TMDBSeries} mediaType="tv" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
