import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../useToast';
import PasswordField from '../AuthModal/PasswordField';
import {
  MIN_PASSWORD_LENGTH,
  getLocalizedAuthError,
  isInvalidCredentials,
  validatePassword,
} from '../AuthModal/errors';
import { logError } from '../../utils/logger';
import authStyles from '../AuthModal/AuthModal.module.css';

type FieldName = 'current' | 'password' | 'confirm';

// TODO(step 4): accounts created with Google have no password. When
// user.app_metadata.providers does not include 'email', hide the "current
// password" field here and offer "Set a password" via updateUser({ password })
// directly. Skipped until Google sign-in exists.

export default function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { changePassword } = useAuth();

  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<FieldName | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const errorId = 'change-password-error';

  function fail(message: string, field: FieldName) {
    setError(message);
    setErrorField(field);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setErrorField(null);

    if (!current) return fail(t('auth.errors.passwordRequired'), 'current');
    const policyError = validatePassword(password, t);
    if (policyError) return fail(policyError, 'password');
    if (password === current) return fail(t('auth.errors.samePassword'), 'password');
    if (password !== confirm) return fail(t('auth.errors.passwordMismatch'), 'confirm');

    setSubmitting(true);
    try {
      await changePassword(current, password);
      toast?.(t('toast.passwordUpdated'), { kind: 'info' });
      setCurrent('');
      setPassword('');
      setConfirm('');
      onDone();
    } catch (err) {
      logError('auth.changePassword', err);
      if (isInvalidCredentials(err)) {
        fail(t('auth.errors.currentPasswordIncorrect'), 'current');
      } else {
        setError(getLocalizedAuthError(err, t));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={authStyles.form} onSubmit={handleSubmit} noValidate>
      <PasswordField
        label={t('settings.credentials.currentPassword')}
        value={current}
        onChange={setCurrent}
        placeholder={t('auth.passwordPlaceholder')}
        autoComplete="current-password"
        disabled={submitting}
        invalid={errorField === 'current'}
        describedBy={errorId}
      />
      <PasswordField
        label={t('auth.reset.newPassword')}
        value={password}
        onChange={setPassword}
        placeholder={t('auth.newPasswordPlaceholder', { count: MIN_PASSWORD_LENGTH })}
        autoComplete="new-password"
        disabled={submitting}
        invalid={errorField === 'password'}
        describedBy={errorId}
      />
      <PasswordField
        label={t('auth.confirmPassword')}
        value={confirm}
        onChange={setConfirm}
        placeholder={t('auth.repeatPasswordPlaceholder')}
        autoComplete="new-password"
        disabled={submitting}
        invalid={errorField === 'confirm'}
        describedBy={errorId}
      />

      {error && (
        <p id={errorId} className={authStyles.error} role="alert">
          {error}
        </p>
      )}

      <button type="submit" className={authStyles.button} disabled={submitting}>
        {submitting ? t('settings.credentials.savingPassword') : t('settings.credentials.savePassword')}
      </button>
    </form>
  );
}
