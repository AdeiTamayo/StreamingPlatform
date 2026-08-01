import { useState, type FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getErrorMessage, isValidEmail } from './errors';
import styles from './AuthModal.module.css';

interface LoginFormProps {
  onSwitchToRegister: () => void;
  onSwitchToForgot: () => void;
}

export default function LoginForm({ onSwitchToRegister, onSwitchToForgot }: LoginFormProps) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Enter your email address.');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      await signIn(trimmedEmail, password);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

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

      <label className={styles.field}>
        <span className={styles.label}>Password</span>
        <input
          type="password"
          className={styles.input}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>

      <button type="button" className={styles.linkBtn} onClick={onSwitchToForgot}>
        Forgot password?
      </button>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <button type="submit" className={styles.button} disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign In'}
      </button>

      <p className={styles.switchRow}>
        New to StreamFlow?{' '}
        <button type="button" className={styles.linkBtn} onClick={onSwitchToRegister}>
          Create an account
        </button>
      </p>
    </form>
  );
}
