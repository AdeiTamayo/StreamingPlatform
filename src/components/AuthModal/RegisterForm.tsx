import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { getLocalizedAuthError, isValidEmail, validatePassword, MIN_PASSWORD_LENGTH } from './errors';
import { logError } from '../../utils/logger';
import styles from './AuthModal.module.css';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

type FieldName = 'email' | 'password' | 'confirm';

export default function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
  const { t } = useTranslation();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<FieldName | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  const errorId = 'register-form-error';

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
    const passwordError = validatePassword(password, t);
    if (passwordError) {
      setError(passwordError);
      setErrorField('password');
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.errors.passwordMismatch'));
      setErrorField('confirm');
      return;
    }

    setSubmitting(true);
    try {
      const { session } = await signUp(trimmedEmail, password);
      if (!session) {
        setPendingConfirmation(true);
      }
    } catch (err) {
      logError('auth.signUp', err);
      setError(getLocalizedAuthError(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  if (pendingConfirmation) {
    return (
      <div className={styles.form}>
        <p className={styles.success} role="status">
          {t('auth.accountCreated')}
        </p>
        <button type="button" className={styles.button} onClick={onSwitchToLogin} autoFocus>
          {t('auth.backToSignIn')}
        </button>
      </div>
    );
  }

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
            placeholder={t('auth.newPasswordPlaceholder', { count: MIN_PASSWORD_LENGTH })}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
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

      <label className={styles.field}>
        <span className={styles.label}>{t('auth.confirmPassword')}</span>
        <div className={styles.inputWrap}>
          <input
            type={showConfirmPassword ? 'text' : 'password'}
            className={styles.input}
            placeholder={t('auth.repeatPasswordPlaceholder')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            disabled={submitting}
            aria-invalid={errorField === 'confirm'}
            aria-describedby={errorField === 'confirm' ? errorId : undefined}
          />
          <button
            type="button"
            className={styles.togglePassword}
            onClick={() => setShowConfirmPassword((v) => !v)}
            aria-label={showConfirmPassword ? t('auth.hidePassword') : t('auth.showPassword')}
            aria-pressed={showConfirmPassword}
            disabled={submitting}
          >
            {showConfirmPassword ? t('auth.hide') : t('auth.show')}
          </button>
        </div>
      </label>

      {error && <p id={errorId} className={styles.error} role="alert">{error}</p>}

      <button
        type="submit"
        className={styles.button}
        disabled={submitting}
        aria-describedby={error && !errorField ? errorId : undefined}
      >
        {submitting ? t('auth.creatingAccount') : t('auth.signUp')}
      </button>

      <p className={styles.switchRow}>
        {t('auth.alreadyHaveAccount')}{' '}
        <button type="button" className={styles.linkBtn} onClick={onSwitchToLogin} disabled={submitting}>
          {t('auth.signInLink')}
        </button>
      </p>
    </form>
  );
}
