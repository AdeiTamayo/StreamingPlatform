import { useTranslation } from 'react-i18next';

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
  trailerLabel,
  playerLabel,
  className = '',
}: ViewModeToggleProps) {
  const { t } = useTranslation();
  const trailer = trailerLabel ?? t('viewMode.trailer');
  const player = playerLabel ?? t('viewMode.player');

  return (
    <div className={`view-mode-toggle ${className}`.trim()} role="tablist" aria-label={t('viewMode.label')}>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'trailer'}
        className={`view-mode-option${mode === 'trailer' ? ' active' : ''}`}
        onClick={() => onChange('trailer')}
      >
        {trailer}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'player'}
        className={`view-mode-option${mode === 'player' ? ' active' : ''}`}
        onClick={() => onChange('player')}
      >
        {player}
      </button>
    </div>
  );
}
