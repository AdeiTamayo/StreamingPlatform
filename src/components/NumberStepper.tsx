import { useId } from 'react';
import styles from './NumberStepper.module.css';

interface NumberStepperProps {
  /** Used for the button labels, e.g. "minimum votes". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  placeholder?: string;
}

export default function NumberStepper({
  label,
  value,
  onChange,
  id,
  min = 0,
  max = 999999,
  step = 1,
  maxLength = 6,
  placeholder,
}: NumberStepperProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const numeric = value === '' ? null : Number(value);
  const atMin = numeric === null || numeric <= min;
  const atMax = numeric !== null && numeric >= max;

  function commit(next: number) {
    const clamped = Math.min(max, Math.max(min, next));
    onChange(String(Math.round(clamped)));
  }

  function adjust(delta: number) {
    commit((numeric ?? min) + delta);
  }

  function handleChange(next: string) {
    const digits = next.replace(/\D/g, '').slice(0, maxLength);
    if (digits === '') {
      onChange('');
      return;
    }
    onChange(String(Math.min(max, Number(digits))));
  }

  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.btn}
        onClick={() => adjust(-step)}
        disabled={atMin}
        aria-label={`Decrease ${label}`}
        title={`Decrease ${label}`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <input
        id={inputId}
        className={styles.input}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        className={styles.btn}
        onClick={() => adjust(step)}
        disabled={atMax}
        aria-label={`Increase ${label}`}
        title={`Increase ${label}`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <line x1="12" y1="5" x2="12" y2="19" />
        </svg>
      </button>
    </div>
  );
}
