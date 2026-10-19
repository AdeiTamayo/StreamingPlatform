import FilterDropdown from './FilterDropdown';
import './FilterBar.module.css';
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
        <div className="filter-row" role="group" aria-label="Quick filters">
            <div className="filter-control">
                <span className="filter-control-label">Country</span>
                <FilterDropdown value={countryValue} options={countryOptions} placeholder="All countries" onSelect={onCountryChange} />
            </div>
            <div className="filter-control">
                <span className="filter-control-label">Genre</span>
                <FilterDropdown value={genreValue} options={genreOptions} placeholder="All genres" onSelect={onGenreChange} />
            </div>
            {hasActiveFilters && (
                <button type="button" className="filter-clear-btn" onClick={onClearFilters} title="Clear all filters" aria-label="Clear all filters">Clear</button>
            )}
            <button type="button" className="more-filters-toggle" onClick={onToggleShowMore} aria-expanded={showMore} aria-label={showMore ? 'Hide more filters' : 'Show more filters'}>
                {showMore ? 'Hide filters' : 'More filters'}
                <span className={`cs-arrow ${showMore ? 'open' : ''}`} aria-hidden="true">&#9662;</span>
            </button>
        </div>
    );
}