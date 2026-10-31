import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { getLocalizedAuthError, isValidEmail } from './errors';
import { logError } from '../../utils/logger';
import styles from './AuthModal.module.css';

interface LoginFormProps {
  onSwitchToRegister: () => void;
  onSwitchToForgot: () => void;
}

type FieldName = 'email' | 'password';

export default function LoginForm({ onSwitchToRegister, onSwitchToForgot }: LoginFormProps) {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<FieldName | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const errorId = 'login-form-error';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setErrorField(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(t('auth.errors.emailRequired'));
      setErrorField('email');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setError(t('auth.errors.emailInvalid'));
      setErrorField('email');
      return;
    }
    if (!password) {
      setError(t('auth.errors.passwordRequired'));
      setErrorField('password');
      return;
    }

    setSubmitting(true);
    try {
      await signIn(trimmedEmail, password);
    } catch (err) {
      logError('auth.signIn', err);
      setError(getLocalizedAuthError(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <label className={styles.field}>
        <span className={styles.label}>{t('auth.email')}</span>
        <input
          type="email"
          className={styles.input}
          placeholder={t('auth.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
          required
          disabled={submitting}
          aria-invalid={errorField === 'email'}
          aria-describedby={errorField === 'email' ? errorId : undefined}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{t('auth.password')}</span>
        <div className={styles.inputWrap}>
          <input
            type={showPassword ? 'text' : 'password'}
            className={styles.input}
            placeholder={t('auth.passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={submitting}
            aria-invalid={errorField === 'password'}
            aria-describedby={errorField === 'password' ? errorId : undefined}
          />
          <button
            type="button"
            className={styles.togglePassword}
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
            aria-pressed={showPassword}
            disabled={submitting}
          >
            {showPassword ? t('auth.hide') : t('auth.show')}
          </button>
        </div>
      </label>

      <button type="button" className={styles.linkBtn} onClick={onSwitchToForgot} disabled={submitting}>
        {t('auth.forgotPassword')}
      </button>

      {error && <p id={errorId} className={styles.error} role="alert">{error}</p>}

      <button
        type="submit"
        className={styles.button}
        disabled={submitting}
        aria-describedby={error && !errorField ? errorId : undefined}
      >
        {submitting ? t('auth.signingIn') : t('auth.signIn')}
      </button>

      <p className={styles.switchRow}>
        {t('auth.newToApp')}{' '}
        <button type="button" className={styles.linkBtn} onClick={onSwitchToRegister} disabled={submitting}>
          {t('auth.createAccountLink')}
        </button>
      </p>
    </form>
  );
}
