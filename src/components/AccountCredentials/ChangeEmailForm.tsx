import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../useToast';
import { getLocalizedAuthError, isValidEmail } from '../AuthModal/errors';
import { logError } from '../../utils/logger';
import authStyles from '../AuthModal/AuthModal.module.css';

export default function ChangeEmailForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { changeEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const errorId = 'change-email-error';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const trimmed = email.trim();
    if (!trimmed) {
      setError(t('auth.errors.emailRequired'));
      return;
    }
    if (!isValidEmail(trimmed)) {
      setError(t('auth.errors.emailInvalid'));
      return;
    }

    setSubmitting(true);
    try {
      await changeEmail(trimmed);
      toast?.(t('toast.emailChangeRequested'), { kind: 'info' });
      // The displayed email is deliberately not touched: Supabase only
      // changes it after the user confirms, and the session reports that.
      setSent(true);
    } catch (err) {
      logError('auth.changeEmail', err);
      setError(getLocalizedAuthError(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className={authStyles.form}>
        <p className={authStyles.success} role="status">
          {t('settings.credentials.emailChangeSent')}
        </p>
        <button type="button" className={authStyles.button} onClick={onDone} autoFocus>
          {t('common.done')}
        </button>
      </div>
    );
  }

  return (
    <form className={authStyles.form} onSubmit={handleSubmit} noValidate>
      <label className={authStyles.field}>
        <span className={authStyles.label}>{t('settings.credentials.newEmail')}</span>
        <input
          type="email"
          className={authStyles.input}
          placeholder={t('auth.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          disabled={submitting}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
      </label>

      {error && (
        <p id={errorId} className={authStyles.error} role="alert">
          {error}
        </p>
      )}

      <button type="submit" className={authStyles.button} disabled={submitting}>
        {submitting ? t('auth.sending') : t('settings.credentials.sendEmailChange')}
      </button>
    </form>
  );
}
