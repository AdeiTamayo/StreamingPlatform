export interface TypeToggleOption {
  value: string;
  label: string;
}

interface TypeToggleProps {
  value: string;
  options: TypeToggleOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}

export default function TypeToggle({
  value,
  options,
  onChange,
  ariaLabel = 'Filter by type',
  className = '',
}: TypeToggleProps) {
  return (
    <div className={`type-toggle ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`type-toggle-btn${value === option.value ? ' active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
