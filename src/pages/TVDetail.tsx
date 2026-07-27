import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getTVDetail, getSeasonDetails, imageUrl } from '../api/tmdb';
import { getTVEmbedUrl, getSourceLabel, SOURCE_KEYS } from '../api/vidsrc';
import { isWatched, markWatched, markUnwatched, getLastWatchedEpisode, saveProgress, getProgress, clearProgress, isInWatchLater, addWatchLater, removeWatchLater, getWatchedCount, isInEpisodeWatchLater, addEpisodeWatchLater, removeEpisodeWatchLater, markSeasonWatched, getVideoSource, getEpisodeWatchLater, isAlreadyNotified, addNotification } from '../api/storage';
import Player from '../components/Player';
import EpisodeDropdown from '../components/EpisodeDropdown';
import SeasonDropdown from '../components/SeasonDropdown';
import FilterDropdown from '../components/FilterDropdown';
import MediaCard from '../components/MediaCard';
import { useToast } from '../components/useToast';
import { useAbortController } from '../hooks/useAbortController';
import { logDebug } from '../utils/logger';
import styles from './TVDetail.module.css';

const AUTO_WATCH_REMAINING_SECONDS = 5 * 60;

export default function TVDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const urlSeason = searchParams.get('season');
  const urlEpisode = searchParams.get('episode');
  const [show, setShow] = useState(null);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [watched, setWatched] = useState(false);
  const [startAt, setStartAt] = useState(null);
  const [inWL, setInWL] = useState(false);
  const [inEpWL, setInEpWL] = useState(false);
  const [watchedCount, setWatchedCount] = useState(0);
  const [episodes, setEpisodes] = useState([]);
  const [trailerKey, setTrailerKey] = useState(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [videoSource, setVideoSource] = useState(getVideoSource());
  const [playerOpen, setPlayerOpen] = useState(false);
  const watchedRef = useRef(false);
  const autoWatchedRef = useRef(null);
  const { getSignal } = useAbortController();

  const seasons = useMemo(() => show?.seasons?.filter((s) => s.season_number > 0) || [], [show]);
  const currentSeason = useMemo(() => seasons.find((s) => s.season_number === season), [seasons, season]);
  const episodeCount = currentSeason?.episode_count || 12;
  const seasonIdx = seasons.findIndex((s) => s.season_number === season);
  const hasPrev = episode > 1 || seasonIdx > 0;
  const episodeNums = useMemo(() => Array.from({ length: episodeCount }, (_, i) => i + 1), [episodeCount]);
  const watchedStates = useMemo(() => {
    const map = {};
    episodeNums.forEach((ep) => { map[ep] = isWatched('tv', id, season, ep); });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeNums, id, season, watchedCount]);

  const hasNext = episode < episodeCount || seasonIdx < seasons.length - 1;

  useEffect(() => {
    setLoading(true);
    setError(false);
    watchedRef.current = false;
    autoWatchedRef.current = null;
    setTrailerKey(null);
    setShowTrailer(false);
    getTVDetail(id, getSignal())
      .then((data) => {
        setShow(data);
        document.title = `${data.name} - StreamFlow`;
        setInWL(isInWatchLater('tv', id));
        const vids = data.videos?.results || [];
        const yt = vids.find((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
        if (yt) setTrailerKey(yt.key);
        const s = data.seasons?.filter((s) => s.season_number > 0) || [];
        if (s.length === 0) return;
        const firstSeason = s[0].season_number;
        const requestedSeason = Number(urlSeason);
        const requestedEpisode = Number(urlEpisode);
        const requestedSeasonExists = requestedSeason > 0 && s.some((seasonItem) => seasonItem.season_number === requestedSeason);
        const last = getLastWatchedEpisode(id);
        if (requestedSeasonExists && requestedEpisode > 0) {
          setSeason(requestedSeason);
          setEpisode(requestedEpisode);
          setPlayerOpen(true);
        } else if (last && s.find((seasonItem) => seasonItem.season_number === last.season)) {
          setSeason(last.season);
          setEpisode(last.episode);
        } else {
          setSeason(firstSeason);
          setEpisode(1);
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [id, urlSeason, urlEpisode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
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
    setWatchedCount(getWatchedCount(id, season, episodeCount));
  }, [id, season, episodeCount, watched]);

  useEffect(() => {
    getSeasonDetails(id, season, getSignal()).then((data) => {
      setEpisodes(data.episodes || []);
    }).catch(() => { });
  }, [id, season]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check for new episodes of watch-later shows
  useEffect(() => {
    if (!show) return;
    const now = new Date();
    let added = 0;

    // For full-series watch later: check latest season
    if (inWL) {
      const latestSeason = seasons[seasons.length - 1];
      if (latestSeason) {
        getSeasonDetails(id, latestSeason.season_number, getSignal()).then((data) => {
          const eps = data.episodes || [];
          for (const ep of eps) {
            if (!ep.air_date) continue;
            if (new Date(ep.air_date) > now) continue;
            if (isWatched('tv', id, latestSeason.season_number, ep.episode_number)) continue;
            if (isAlreadyNotified(id, latestSeason.season_number, ep.episode_number)) continue;
            if (added >= 5) break;
            addNotification(id, show.name, latestSeason.season_number, ep.episode_number, ep.name, 'new_episode', ep.air_date);
            added++;
          }
        }).catch(() => {});
      }
    }

    // For episode watch later items: check saved episodes of this show
    const epwlItems = getEpisodeWatchLater().filter((item) => String(item.showId) === String(id));
    if (epwlItems.length > 0) {
      const seasonsToCheck = [...new Set(epwlItems.map((item) => item.season))];
      seasonsToCheck.forEach((seasonNum) => {
        getSeasonDetails(id, seasonNum, getSignal()).then((data) => {
          const eps = data.episodes || [];
          for (const epwl of epwlItems) {
            if (epwl.season !== seasonNum) continue;
            const ep = eps.find((e) => e.episode_number === epwl.episode);
            if (!ep || !ep.air_date) continue;
            if (new Date(ep.air_date) > now) continue;
            if (isWatched('tv', id, seasonNum, epwl.episode)) continue;
            if (isAlreadyNotified(id, seasonNum, epwl.episode)) continue;
            if (added >= 5) break;
            addNotification(id, show.name, seasonNum, epwl.episode, ep.name || `Episode ${epwl.episode}`, 'new_episode', ep.air_date);
            added++;
          }
        }).catch(() => {});
      });
    }
  }, [show, inWL]); // eslint-disable-line react-hooks/exhaustive-deps

  function autoMarkWatched() {
    const episodeKey = `${season}-${episode}`;
    if (!show || watchedRef.current || autoWatchedRef.current === episodeKey) return;
    autoWatchedRef.current = episodeKey;
    markWatched('tv', id, show.name, season, episode, { title: show.name, poster: show?.poster_path });
    clearProgress('tv', id, season, episode);
    watchedRef.current = true;
    setWatched(true);
    setStartAt(null);
  }

  function handleProgress(currentTime, duration) {
    if (watchedRef.current || !show) return;
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

  function toggleWatched() {
    if (watched) {
      markUnwatched('tv', id, season, episode);
      clearProgress('tv', id, season, episode);
      setWatched(false);
      toast('Removed from watched');
    } else {
      markWatched('tv', id, show.name, season, episode, { title: show.name, poster: show?.poster_path });
      clearProgress('tv', id, season, episode);
      setWatched(true);
      toast('Marked as watched');
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
    if (watchedRef.current || !show) return;
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
    setLoading(true);
    setError(false);
    getTVDetail(id, getSignal()).then((data) => { setShow(data); }).catch((err) => { if (err?.name !== 'AbortError') setError(true); }).finally(() => setLoading(false));
  }

  if (loading) return <div className="page"><div className="loading" role="status">Loading...</div></div>;

  if (error) return (
    <div className="page" role="alert">
      <div className="loading">Failed to load. Check your connection.</div>
      <div className="retry-bar"><button className="watch-toggle" onClick={retry}>Retry</button></div>
    </div>
  );
  if (!show) return <div className="page"><div className="loading">Show not found</div></div>;

  const embedUrl = getTVEmbedUrl(id, season, episode, videoSource);
  const backdrop = imageUrl(show.backdrop_path, 'original');
  const year = (show.first_air_date || '').slice(0, 4);
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
            <h1>{show.name} <span className="year">({year})</span></h1>
            <div className="detail-badges">
              <span className="badge rating">{show.vote_average?.toFixed(1)}</span>
              {genres && <span className="badge">{genres}</span>}
              <span className="badge">{seasons.length} Seasons</span>
              <button className={`badge-btn ${inWL ? 'in-wl' : ''}`} onClick={() => {
                if (inWL) { removeWatchLater('tv', id); setInWL(false); }
                else { addWatchLater('tv', id, show.name, year, imageUrl(show.poster_path)); setInWL(true); }
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
                onSelect={(s) => { setSeason(s); setEpisode(1); }}
              />
            </label>
            <label>
              <EpisodeDropdown
                showId={id}
                season={season}
                episode={episode}
                episodes={episodes}
                onSelect={(ep) => { setEpisode(ep); }}
              />
            </label>
            <button className={`watch-toggle ${watched ? 'watched' : ''}`} onClick={toggleWatched}>
              {watched ? 'Watched' : 'Mark as watched'}
            </button>
            <button className={`watch-toggle ${inEpWL ? 'in-wl' : ''}`} onClick={() => {
              if (inEpWL) { removeEpisodeWatchLater(id, season, episode); setInEpWL(false); }
              else { addEpisodeWatchLater(id, season, episode, show.name); setInEpWL(true); }
            }}>{inEpWL ? 'Saved' : 'Watch Later'}</button>
            {trailerKey && (
              <button className="watch-toggle" onClick={() => setShowTrailer((s) => !s)}>
                {showTrailer ? 'Hide Trailer' : 'Trailer'}
              </button>
            )}
            {startAt && (
              <button className="watch-toggle restart-btn" onClick={() => { setStartAt(null); clearProgress('tv', id, season, episode); }}>
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
                  markSeasonWatched(id, season, episodeCount, show.name, show?.poster_path);
                  setWatchedCount(getWatchedCount(id, season, episodeCount));
                  setWatched(isWatched('tv', id, season, episode));
                  toast('Season marked as watched');
                }}>Mark season watched</button>
              )}
            </div>
            <div className={styles.spBar} role="list" aria-label="Episode progress">
              {episodeNums.map((ep) => (
                <button
                  key={ep}
                  role="listitem"
                  className={`${styles.spDot} ${ep === episode ? styles.current : ''} ${watchedStates[ep] ? styles.done : ''}`}
                  onClick={() => setEpisode(ep)}
                  title={`Episode ${ep}`}
                />
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
              <span className={styles.epNavLabel}>S{season} E{episode}</span>
              <button className={styles.epNavBtn} disabled={!hasNext} onClick={goNext}>Next &#9654;</button>
              <button className={`${styles.epNavWatch} ${watched ? styles.watched : ''}`} onClick={toggleWatched} title={watched ? 'Unmark watched' : 'Mark as watched'}>&#10003;</button>
            </div>
            <FilterDropdown
              value={videoSource}
              options={SOURCE_KEYS.map((key) => ({ value: key, label: getSourceLabel(key) }))}
              placeholder="Source"
              onSelect={(val) => setVideoSource(val)}
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
              onSelect={(s) => { setSeason(s); setEpisode(1); }}
            />
          </div>
          <div className={styles.seasonProgress}>
            <div className={styles.spHeader}>
              <span className={styles.spLabel}>Season {season}</span>
              <span className={styles.spCount}>{watchedCount}/{episodeCount} watched</span>
              {watchedCount < episodeCount && (
                <button className={styles.markSeasonBtn} onClick={() => {
                  markSeasonWatched(id, season, episodeCount, show.name, show?.poster_path);
                  setWatchedCount(getWatchedCount(id, season, episodeCount));
                  setWatched(isWatched('tv', id, season, episode));
                  toast('Season marked as watched');
                }}>Mark season watched</button>
              )}
            </div>
            <div className={styles.spBar}>
              {episodeNums.map((ep) => (
                <button
                  key={ep}
                  className={`${styles.spDot} ${watchedStates[ep] ? styles.done : ''}`}
                  onClick={() => { setEpisode(ep); setPlayerOpen(true); }}
                  title={`Episode ${ep}`}
                />
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
              <MediaCard key={item.id} item={item} mediaType="tv" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
