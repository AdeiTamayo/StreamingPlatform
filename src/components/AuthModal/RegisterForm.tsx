import { useState, type FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getErrorMessage, isValidEmail } from './errors';
import styles from './AuthModal.module.css';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

export default function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

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
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { session } = await signUp(trimmedEmail, password);
      if (!session) {
        setPendingConfirmation(true);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (pendingConfirmation) {
    return (
      <div className={styles.form}>
        <p className={styles.success} role="status">
          Account created! Check your email to confirm your account, then sign in.
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

      <label className={styles.field}>
        <span className={styles.label}>Password</span>
        <input
          type="password"
          className={styles.input}
          placeholder="At least 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Confirm Password</span>
        <input
          type="password"
          className={styles.input}
          placeholder="Repeat your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </label>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <button type="submit" className={styles.button} disabled={submitting}>
        {submitting ? 'Creating account…' : 'Create Account'}
      </button>

      <p className={styles.switchRow}>
        Already have an account?{' '}
        <button type="button" className={styles.linkBtn} onClick={onSwitchToLogin}>
          Sign in
        </button>
      </p>
    </form>
  );
}
