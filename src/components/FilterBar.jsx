import FilterDropdown from './FilterDropdown';
import DatePickerField from './DatePickerField';

export default function FilterBar({
    countryValue,
    genreValue,
    yearValue,
    sortValue,
    releaseDateFrom,
    releaseDateUntil,
    showMore,
    onToggleShowMore,
    onCountryChange,
    onGenreChange,
    onYearChange,
    onSortChange,
    onReleaseDateFromChange,
    onReleaseDateUntilChange,
    countryOptions,
    genreOptions,
    yearOptions,
    sortOptions,
}) {
    return (
        <>
            <div className="filter-row">
                <FilterDropdown value={countryValue} options={countryOptions} placeholder="All countries" onSelect={onCountryChange} />
                <FilterDropdown value={genreValue} options={genreOptions} placeholder="All genres" onSelect={onGenreChange} />
                <button className="more-filters-toggle" onClick={onToggleShowMore}>
                    {showMore ? 'Hide more filters' : 'Show more filters'}
                </button>
            </div>

            {showMore && (
                <div className="more-filters-panel">
                    <DatePickerField label="From" value={releaseDateFrom} placeholder="Select start date" onChange={onReleaseDateFromChange} />
                    <DatePickerField label="Until" value={releaseDateUntil} placeholder="Select end date" onChange={onReleaseDateUntilChange} />
                    <FilterDropdown value={yearValue} options={yearOptions} placeholder="Any year" onSelect={onYearChange} />
                    <FilterDropdown value={sortValue} options={sortOptions} placeholder="Sort by" onSelect={onSortChange} />
                </div>
            )}
        </>
    );
}