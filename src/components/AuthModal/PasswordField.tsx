import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './AuthModal.module.css';

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
}

/** Password input with a show/hide toggle, styled with the AuthModal classes. */
export default function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  disabled,
  invalid,
  describedBy,
  autoFocus,
}: PasswordFieldProps) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <div className={styles.inputWrap}>
        <input
          type={show ? 'text' : 'password'}
          className={styles.input}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={invalid ? describedBy : undefined}
        />
        <button
          type="button"
          className={styles.togglePassword}
          onClick={() => setShow((v) => !v)}
          aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
          aria-pressed={show}
          disabled={disabled}
        >
          {show ? t('auth.hide') : t('auth.show')}
        </button>
      </div>
    </label>
  );
}
