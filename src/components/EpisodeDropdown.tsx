import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getWatchedEpisodeSet } from '../api/storage';
import SelectDropdown from './SelectDropdown';
import type { TMDBEpisode } from '../types';

interface EpisodeDropdownProps {
  showId: number | string;
  season: number;
  episode: number;
  episodes: TMDBEpisode[];
  onSelect: (episodeNumber: number) => void;
}

export default function EpisodeDropdown({ showId, season, episode, episodes, onSelect }: EpisodeDropdownProps) {
  const { t } = useTranslation();
  const watchedSet = useMemo(() => getWatchedEpisodeSet(showId, season), [showId, season]);

  const current = episodes.find((e) => e.episode_number === episode);
  const triggerLabel = current
    ? `${current.episode_number}. ${current.name}`
    : t('episodeDropdown.episodeN', { episode });

  const options = useMemo(
    () =>
      episodes.map((ep) => {
        const watched = watchedSet.has(ep.episode_number);
        return {
          value: ep.episode_number,
          label: `${ep.episode_number}. ${ep.name}`,
          searchText: `${ep.episode_number} ${ep.name || ''}`,
          className: watched ? 'watched' : '',
          node: (
            <span className="cs-item-label">
              <span className="cs-item-num">{ep.episode_number}.</span>
              {ep.name}
            </span>
          ),
          trailing: watched ? (
            <span className="cs-check" aria-hidden="true" title={t('episodeDropdown.watched')}>&#10003;</span>
          ) : undefined,
        };
      }),
    [episodes, watchedSet, t],
  );

  return (
    <SelectDropdown
      value={episode}
      options={options}
      onSelect={onSelect}
      menuLabel={t('episodeDropdown.menuLabel')}
      triggerLabel={triggerLabel}
    />
  );
}
