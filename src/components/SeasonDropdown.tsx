import SelectDropdown from './SelectDropdown';
import type { TMDBSeason } from '../types';

interface SeasonDropdownProps {
  seasons: TMDBSeason[];
  value: number;
  onSelect: (seasonNumber: number) => void;
}

export default function SeasonDropdown({ seasons, value, onSelect }: SeasonDropdownProps) {
  const options = seasons.map((s) => ({
    value: s.season_number,
    label: s.name || `Season ${s.season_number}`,
  }));

  return (
    <SelectDropdown
      value={value}
      options={options}
      onSelect={onSelect}
      menuLabel="Select season"
    />
  );
}
