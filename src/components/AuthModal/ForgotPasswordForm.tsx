import { useState, type FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import styles from './AuthModal.module.css';

interface ForgotPasswordFormProps {
  onSwitchToLogin: () => void;
}

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export default function ForgotPasswordForm({ onSwitchToLogin }: ForgotPasswordFormProps) {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className={styles.form}>
        <p className={styles.success} role="status">
          If an account exists for <strong>{email.trim()}</strong>, a password reset link has been
          sent. Check your inbox.
        </p>
        <button type="button" className={styles.button} onClick={onSwitchToLogin}>
          Back to Sign In
        </button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <label className={styles.field}>
        <span className={styles.label}>Email</span>
        <input
          type="email"
          className={styles.input}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
          required
        />
      </label>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <button type="submit" className={styles.button} disabled={submitting}>
        {submitting ? 'Sending…' : 'Send Reset Link'}
      </button>

      <p className={styles.switchRow}>
        Remembered your password?{' '}
        <button type="button" className={styles.linkBtn} onClick={onSwitchToLogin}>
          Sign in
        </button>
      </p>
    </form>
  );
}
