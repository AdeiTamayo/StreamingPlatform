import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/useToast';
import { usePageTitle } from '../i18n/usePageTitle';
import {
  MIN_PASSWORD_LENGTH,
  getLocalizedAuthError,
  validatePassword,
} from '../components/AuthModal/errors';
import { logError } from '../utils/logger';
import authStyles from '../components/AuthModal/AuthModal.module.css';
import styles from './ResetPassword.module.css';

// The recovery event arrives a moment after the page mounts (supabase-js
// emits it asynchronously once it has read the link). Without a grace period
// the "link is invalid" message would flash before the form on every valid
// link. If nothing arrives in this time the link really is unusable.
const RECOVERY_GRACE_MS = 5000;

function hashParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.replace(/^#/, ''));
}

// Supabase reports a bad or expired link as #error=...&error_code=otp_expired.
function linkHasError(hash: string): boolean {
  const params = hashParams(hash);
  return params.has('error') || params.has('error_code') || params.has('error_description');
}

function linkIsRecovery(hash: string): boolean {
  return hashParams(hash).get('type') === 'recovery';
}

type FieldName = 'password' | 'confirm';

export default function ResetPassword() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const { isPasswordRecovery, loading, updatePassword, endPasswordRecovery, openAuthModal } = useAuth();

  usePageTitle(t('auth.reset.title'));

  // Captured once: supabase-js strips the fragment after reading it, but the
  // decision about what the link was has to survive that.
  const initialHash = useRef(hash).current;
  const hadLinkError = linkHasError(initialHash);
  const expectsRecovery = linkIsRecovery(initialHash);

  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    if (!expectsRecovery || isPasswordRecovery) return;
    const timer = setTimeout(() => setGraceOver(true), RECOVERY_GRACE_MS);
    return () => clearTimeout(timer);
  }, [expectsRecovery, isPasswordRecovery]);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<FieldName | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const errorId = 'reset-password-error';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setErrorField(null);

    const policyError = validatePassword(password, t);
    if (policyError) {
      setError(policyError);
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
      await updatePassword(password);
      toast?.(t('toast.passwordUpdated'), { kind: 'info' });
      navigate('/', { replace: true });
    } catch (err) {
      logError('auth.updatePassword', err);
      setError(getLocalizedAuthError(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  function skip() {
    endPasswordRecovery();
    navigate('/', { replace: true });
  }

  if (isPasswordRecovery) {
    return (
      <div className="page">
        <div className={styles.wrap}>
          <div className={styles.card}>
            <h1 className={authStyles.title}>{t('auth.reset.title')}</h1>
            <p className={authStyles.subtitle}>{t('auth.reset.subtitle')}</p>

            <form className={authStyles.form} onSubmit={handleSubmit} noValidate>
              <label className={authStyles.field}>
                <span className={authStyles.label}>{t('auth.reset.newPassword')}</span>
                <div className={authStyles.inputWrap}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className={authStyles.input}
                    placeholder={t('auth.newPasswordPlaceholder', { count: MIN_PASSWORD_LENGTH })}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    autoFocus
                    required
                    disabled={submitting}
                    aria-invalid={errorField === 'password'}
                    aria-describedby={errorField === 'password' ? errorId : undefined}
                  />
                  <button
                    type="button"
                    className={authStyles.togglePassword}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    aria-pressed={showPassword}
                    disabled={submitting}
                  >
                    {showPassword ? t('auth.hide') : t('auth.show')}
                  </button>
                </div>
              </label>

              <label className={authStyles.field}>
                <span className={authStyles.label}>{t('auth.confirmPassword')}</span>
                <div className={authStyles.inputWrap}>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    className={authStyles.input}
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
                    className={authStyles.togglePassword}
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? t('auth.hidePassword') : t('auth.showPassword')}
                    aria-pressed={showConfirm}
                    disabled={submitting}
                  >
                    {showConfirm ? t('auth.hide') : t('auth.show')}
                  </button>
                </div>
              </label>

              {error && (
                <p id={errorId} className={authStyles.error} role="alert">
                  {error}
                </p>
              )}

              <button type="submit" className={authStyles.button} disabled={submitting}>
                {submitting ? t('auth.reset.saving') : t('auth.reset.submit')}
              </button>
            </form>

            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={skip} disabled={submitting}>
                {t('auth.reset.skip')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const waiting = loading || (expectsRecovery && !hadLinkError && !graceOver);
  if (waiting) {
    return (
      <div className="page">
        <div className="loading" role="status">{t('auth.reset.checking')}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className={styles.wrap}>
        <div className={styles.card}>
          <h1 className={authStyles.title}>{t('auth.reset.invalidTitle')}</h1>
          <p className={authStyles.subtitle}>{t('auth.reset.invalidBody')}</p>
          <div className={styles.actions}>
            <button type="button" className={authStyles.button} onClick={openAuthModal}>
              {t('auth.reset.requestNew')}
            </button>
            <Link to="/" className={styles.secondary}>
              {t('notFound.goHome')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
