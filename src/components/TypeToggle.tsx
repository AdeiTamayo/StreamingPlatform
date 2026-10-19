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
    <div className={`type-toggle ${className}`.trim()} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            className={`type-toggle-btn${active ? ' active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
