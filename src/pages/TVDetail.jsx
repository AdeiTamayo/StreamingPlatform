import { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getTVDetail, imageUrl } from '../api/tmdb';
import { getTVEmbedUrl } from '../api/vidsrc';
import { isWatched, markWatched, markUnwatched, getLastWatchedEpisode, saveProgress, getProgress, clearProgress } from '../api/storage';
import Player from '../components/Player';
import EpisodeDropdown from '../components/EpisodeDropdown';
import SeasonDropdown from '../components/SeasonDropdown';

export default function TVDetail() {
  const { id } = useParams();
  const [show, setShow] = useState(null);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [loading, setLoading] = useState(true);
  const [watched, setWatched] = useState(false);
  const [startAt, setStartAt] = useState(null);
  const progressTimer = useRef(null);

  useEffect(() => {
    setLoading(true);
    getTVDetail(id)
      .then((data) => {
        setShow(data);
        const seasons = data.seasons?.filter((s) => s.season_number > 0) || [];
        if (seasons.length === 0) return;
        const firstSeason = seasons[0].season_number;
        const last = getLastWatchedEpisode(id);
        if (last && seasons.find((s) => s.season_number === last.season)) {
          setSeason(last.season);
          setEpisode(last.episode);
        } else {
          setSeason(firstSeason);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    setWatched(isWatched('tv', id, season, episode));
    const prog = getProgress('tv', id, season, episode);
    setStartAt(prog?.currentTime || null);
  }, [id, season, episode]);

  useEffect(() => {
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, []);

  function handleProgress(currentTime) {
    saveProgress('tv', id, currentTime, season, episode);
  }

  function toggleWatched() {
    if (watched) {
      markUnwatched('tv', id, season, episode);
      clearProgress('tv', id, season, episode);
      setWatched(false);
    } else {
      markWatched('tv', id, `${show.name} S${season}E${episode}`, season, episode);
      clearProgress('tv', id, season, episode);
      setWatched(true);
    }
  }

  if (loading) return <div className="page"><div className="loading">Loading...</div></div>;
  if (!show) return <div className="page"><div className="loading">Show not found</div></div>;

  const seasons = show.seasons?.filter((s) => s.season_number > 0) || [];
  const currentSeason = seasons.find((s) => s.season_number === season);
  const episodeCount = currentSeason?.episode_count || 12;
  const seasonIdx = seasons.findIndex((s) => s.season_number === season);
  const hasPrev = episode > 1 || seasonIdx > 0;
  const hasNext = episode < episodeCount || seasonIdx < seasons.length - 1;

  function goPrev() {
    if (episode > 1) {
      setEpisode(episode - 1);
    } else if (seasonIdx > 0) {
      const prevSeason = seasons[seasonIdx - 1];
      setSeason(prevSeason.season_number);
      setEpisode(prevSeason.episode_count || 12);
    }
  }

  function goNext() {
    if (episode < episodeCount) {
      setEpisode(episode + 1);
    } else if (seasonIdx < seasons.length - 1) {
      setSeason(seasons[seasonIdx + 1].season_number);
      setEpisode(1);
    }
  }

  const embedUrl = getTVEmbedUrl(id, season, episode, startAt);
  const backdrop = imageUrl(show.backdrop_path, 'original');
  const year = (show.first_air_date || '').slice(0, 4);
  const cast = show.credits?.cast?.slice(0, 8) || [];
  const genres = show.genres?.map((g) => g.name).join(', ') || '';

  return (
    <div className="page">
      <Link to="/" className="home-link">Home</Link>
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
            </div>
            <p className="detail-overview">{show.overview}</p>
            {cast.length > 0 && (
              <div className="detail-cast"><strong>Cast:</strong> {cast.map((c) => c.name).join(', ')}</div>
            )}
          </div>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">Watch Now</h2>
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
              episodeCount={episodeCount}
              onSelect={setEpisode}
            />
          </label>
          <button className={`watch-toggle ${watched ? 'watched' : ''}`} onClick={toggleWatched}>
            {watched ? 'Watched' : 'Mark as watched'}
          </button>
          {startAt && (
            <button className="watch-toggle restart-btn" onClick={() => { setStartAt(null); clearProgress('tv', id, season, episode); }}>
              Restart
            </button>
          )}
        </div>
        <Player key={`${season}-${episode}-${startAt !== null ? 'resume' : 'fresh'}`} src={embedUrl} title={`${show.name} S${season}E${episode}`} onProgress={handleProgress} />
        <div className="ep-nav">
          <button className="ep-nav-btn" disabled={!hasPrev} onClick={goPrev}>&#9664; Prev</button>
          <span className="ep-nav-label">S{season} E{episode}</span>
          <button className="ep-nav-btn" disabled={!hasNext} onClick={goNext}>Next &#9654;</button>
        </div>
      </section>
    </div>
  );
}
