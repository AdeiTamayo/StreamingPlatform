import FilterDropdown from './FilterDropdown';
import type { FilterOption } from '../types';

interface FilterBarProps {
  countryValue: string;
  genreValue: string;
  showMore: boolean;
  onToggleShowMore: () => void;
  onCountryChange: (value: string) => void;
  onGenreChange: (value: string) => void;
  countryOptions: FilterOption[];
  genreOptions: FilterOption[];
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export default function FilterBar({
    countryValue,
    genreValue,
    showMore,
    onToggleShowMore,
    onCountryChange,
    onGenreChange,
    countryOptions,
    genreOptions,
    hasActiveFilters,
    onClearFilters,
}: FilterBarProps) {
    return (
        <div className="filter-row">
            <FilterDropdown value={countryValue} options={countryOptions} placeholder="All countries" onSelect={onCountryChange} />
            <FilterDropdown value={genreValue} options={genreOptions} placeholder="All genres" onSelect={onGenreChange} />
            {hasActiveFilters && (
                <button className="filter-clear-btn" onClick={onClearFilters} title="Clear filters" aria-label="Clear filters">&times;</button>
            )}
            <button className="more-filters-toggle" onClick={onToggleShowMore} aria-expanded={showMore} aria-label="More filters">
                {showMore ? '\u25B2' : '\u25BC'}
            </button>
        </div>
    );
}