import { useState, type FormEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { getLocalizedAuthError, isValidEmail } from './errors';
import { logError } from '../../utils/logger';
import styles from './AuthModal.module.css';

interface ForgotPasswordFormProps {
  onSwitchToLogin: () => void;
}

export default function ForgotPasswordForm({ onSwitchToLogin }: ForgotPasswordFormProps) {
  const { t } = useTranslation();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const errorId = 'forgot-form-error';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(t('auth.errors.emailRequired'));
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setError(t('auth.errors.emailInvalid'));
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(trimmedEmail);
      setSent(true);
    } catch (err) {
      logError('auth.resetPassword', err);
      setError(getLocalizedAuthError(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className={styles.form}>
        <p className={styles.success} role="status">
          <Trans i18nKey="auth.resetSent" values={{ email: email.trim() }} />
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
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
      </label>

      {error && <p id={errorId} className={styles.error} role="alert">{error}</p>}

      <button type="submit" className={styles.button} disabled={submitting}>
        {submitting ? t('auth.sending') : t('auth.sendResetLink')}
      </button>

      <p className={styles.switchRow}>
        {t('auth.rememberedPassword')}{' '}
        <button type="button" className={styles.linkBtn} onClick={onSwitchToLogin} disabled={submitting}>
          {t('auth.signInLink')}
        </button>
      </p>
    </form>
  );
}
