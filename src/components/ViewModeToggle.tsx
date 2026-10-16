export type ViewMode = 'trailer' | 'player';

interface ViewModeToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  trailerLabel?: string;
  playerLabel?: string;
  className?: string;
}

export default function ViewModeToggle({
  mode,
  onChange,
  trailerLabel = 'Trailer',
  playerLabel = 'Player',
  className = '',
}: ViewModeToggleProps) {
  return (
    <div className={`view-mode-toggle ${className}`.trim()} role="tablist" aria-label="Playback view">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'trailer'}
        className={`view-mode-option${mode === 'trailer' ? ' active' : ''}`}
        onClick={() => onChange('trailer')}
      >
        {trailerLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'player'}
        className={`view-mode-option${mode === 'player' ? ' active' : ''}`}
        onClick={() => onChange('player')}
      >
        {playerLabel}
      </button>
    </div>
  );
}
