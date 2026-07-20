import FilterDropdown from './FilterDropdown';

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
}) {
    return (
        <div className="filter-row">
            <FilterDropdown value={countryValue} options={countryOptions} placeholder="All countries" onSelect={onCountryChange} />
            <FilterDropdown value={genreValue} options={genreOptions} placeholder="All genres" onSelect={onGenreChange} />
            {hasActiveFilters && (
                <button className="filter-clear-btn" onClick={onClearFilters} title="Clear filters">&times;</button>
            )}
            <button className="more-filters-toggle" onClick={onToggleShowMore}>
                {showMore ? '\u25B2' : '\u25BC'}
            </button>
        </div>
    );
}