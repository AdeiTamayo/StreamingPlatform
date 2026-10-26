import { useId, type KeyboardEvent, type Ref } from 'react';
import FilterDropdown from './FilterDropdown';

interface SelectOption {
  value: string;
  label: string;
}

interface SearchBarProps {
  /** Search query value */
  query: string;
  /** Called when search query changes */
  onQueryChange: (value: string) => void;
  /** Called when search is submitted */
  onSearch?: (value: string) => void;
  /** Placeholder text for search input */
  searchPlaceholder?: string;
  /** Country filter */
  countryValue?: string;
  /** Called when country filter changes */
  onCountryChange?: (value: string) => void;
  /** Country options */
  countryOptions?: SelectOption[];
  /** Genre filter */
  genreValue?: string;
  /** Called when genre filter changes */
  onGenreChange?: (value: string) => void;
  /** Genre options */
  genreOptions?: SelectOption[];
  /** Sort results filter shown in the primary row */
  sortValue?: string;
  /** Called when the sort filter changes */
  onSortChange?: (value: string) => void;
  /** Sort options */
  sortOptions?: SelectOption[];
  /** Whether more filters panel is open */
  showMore?: boolean;
  /** Called when more filters toggle is clicked */
  onToggleShowMore?: () => void;
  /** Additional filters to render in secondary panel */
  children?: React.ReactNode;
  /** Active filters chips */
  activeFilters?: Array<{ key: string; label: string }>;
  /** Called when an active filter is removed */
  onRemoveFilter?: (key: string) => void;
  /** Called when clear all filters is clicked */
  onClearFilters?: () => void;
  /** Custom className for the panel */
  className?: string;
  /** Whether we're in a search context (shows "Refine your results" heading) */
  isSearchContext?: boolean;
  /** Title for the panel heading */
  title?: string;
  /** Subtitle/eyebrow text */
  subtitle?: string;

  /* ---- Search input wiring (suggestions / combobox semantics) ------------- */
  /** Ref forwarded to the underlying search input */
  inputRef?: Ref<HTMLInputElement>;
  /** Called when the search input gains focus */
  onInputFocus?: () => void;
  /** Called when the search input loses focus */
  onInputBlur?: () => void;
  /** Key handler for the search input (history navigation, Escape, ...) */
  onInputKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** Enables combobox ARIA wiring on the search input */
  combobox?: boolean;
  /** aria-expanded for the combobox */
  ariaExpanded?: boolean;
  /** aria-controls for the combobox */
  ariaControls?: string;
  /** aria-activedescendant for the combobox */
  ariaActiveDescendant?: string;
  /** Content rendered as a dropdown anchored below the search input */
  searchOverlay?: React.ReactNode;
}

const CHEVRON_DOWN = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const CHEVRON_UP = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const SEARCH_ICON = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const X_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const SLIDERS_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="4" y1="21" x2="4" y2="14" />
    <line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" />
    <line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="17" y1="16" x2="23" y2="16" />
  </svg>
);

const BIN_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="m19 6-1 14H6L5 6" />
    <path d="M10 11v5M14 11v5" />
  </svg>
);

/** A labelled dropdown matching the query-bar field styling. Shared with the
 *  secondary filter grid so every view renders its filters identically. */
export function SearchSelectField({
  label,
  value,
  options,
  onChange,
  wide = false,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange?: (value: string) => void;
  wide?: boolean;
}) {
  return (
    <div className={`field ${wide ? 'field-wide' : ''}`}>
      <span className="field-label">{label}</span>
      <FilterDropdown
        value={value}
        options={options}
        placeholder={label}
        onSelect={(next) => onChange?.(next)}
        className="query-select"
      />
    </div>
  );
}

export default function SearchBar({
  query,
  onQueryChange,
  onSearch,
  searchPlaceholder = 'Search...',
  countryValue = '',
  onCountryChange,
  countryOptions = [],
  genreValue = '',
  onGenreChange,
  genreOptions = [],
  sortValue = '',
  onSortChange,
  sortOptions = [],
  showMore = false,
  onToggleShowMore,
  children,
  activeFilters = [],
  onRemoveFilter,
  onClearFilters,
  className = '',
  isSearchContext = false,
  title,
  subtitle,
  inputRef,
  onInputFocus,
  onInputBlur,
  onInputKeyDown,
  combobox = false,
  ariaExpanded,
  ariaControls,
  ariaActiveDescendant,
  searchOverlay,
}: SearchBarProps) {
  const headingId = useId();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSearch?.(query.trim());
  };

  return (
    <div className={`query-bar-panel ${className}`.trim()}>
      <section className="movies-panel" aria-labelledby={title ? headingId : undefined}>
        {(title || subtitle) && (
          <div className="panel-heading">
            <div>
              {subtitle && <p className="eyebrow">{subtitle}</p>}
              {title && <h1 id={headingId}>{title}</h1>}
            </div>
          </div>
        )}

        <form className="query-bar" role="search" onSubmit={handleSubmit}>
          <div className="primary-row">
            <div className="search-field-wrap">
              <label className="search-field">
                {SEARCH_ICON}
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label="Search"
                  autoComplete="off"
                  role={combobox ? 'combobox' : undefined}
                  aria-autocomplete={combobox ? 'list' : undefined}
                  aria-expanded={combobox ? ariaExpanded : undefined}
                  aria-controls={combobox ? ariaControls : undefined}
                  aria-activedescendant={combobox ? ariaActiveDescendant : undefined}
                  onFocus={onInputFocus}
                  onBlur={onInputBlur}
                  onKeyDown={onInputKeyDown}
                />
                {query && (
                  <button
                    type="button"
                    className="clear-input"
                    onClick={() => onQueryChange('')}
                    aria-label="Clear search"
                  >
                    {X_ICON}
                  </button>
                )}
              </label>
              {searchOverlay}
            </div>

            {sortOptions.length > 0 && (
              <SearchSelectField
                label="Sort results"
                value={sortValue}
                options={sortOptions}
                onChange={onSortChange}
              />
            )}

            {genreOptions.length > 0 && (
              <SearchSelectField
                label="Genre"
                value={genreValue}
                options={genreOptions}
                onChange={onGenreChange}
              />
            )}

            {onToggleShowMore && (
              <button
                type="button"
                className={`filter-toggle ${showMore ? 'is-open' : ''}`}
                onClick={onToggleShowMore}
                aria-expanded={showMore}
              >
                {SLIDERS_ICON}
                <span>{showMore ? 'Fewer filters' : 'More filters'}</span>
                {showMore ? CHEVRON_UP : CHEVRON_DOWN}
              </button>
            )}
          </div>

          {showMore && (
            <div className="secondary-panel">
              <div className="secondary-heading">
                <div>
                  <h2>{isSearchContext ? 'Refine your results' : 'Additional filters'}</h2>
                  {isSearchContext && <p>Fine-tune your search with more options.</p>}
                </div>
                {(onClearFilters || activeFilters.length > 0) && (
                  <button type="button" className="clear-filters" onClick={onClearFilters}>
                    {BIN_ICON} Clear all
                  </button>
                )}
              </div>

              <div className="secondary-grid">
                {countryOptions.length > 0 && (
                  <SearchSelectField
                    label="Country"
                    value={countryValue}
                    options={countryOptions}
                    onChange={onCountryChange}
                  />
                )}

                {children}
              </div>

              {activeFilters.length > 0 && (
                <div className="active-filters" aria-label="Active filters">
                  {activeFilters.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      className="filter-chip"
                      onClick={() => onRemoveFilter?.(filter.key)}
                      aria-label={`Remove filter: ${filter.label}`}
                    >
                      {filter.label}
                      {X_ICON}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
