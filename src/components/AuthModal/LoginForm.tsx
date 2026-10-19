import { useState, type FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getErrorMessage, isValidEmail } from './errors';
import styles from './AuthModal.module.css';

interface LoginFormProps {
  onSwitchToRegister: () => void;
  onSwitchToForgot: () => void;
}

type FieldName = 'email' | 'password';

export default function LoginForm({ onSwitchToRegister, onSwitchToForgot }: LoginFormProps) {
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
      setError('Enter your email address.');
      setErrorField('email');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setError('Enter a valid email address.');
      setErrorField('email');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      setErrorField('password');
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
          disabled={submitting}
          aria-invalid={errorField === 'email'}
          aria-describedby={errorField === 'email' ? errorId : undefined}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Password</span>
        <div className={styles.inputWrap}>
          <input
            type={showPassword ? 'text' : 'password'}
            className={styles.input}
            placeholder="••••••••"
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
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            disabled={submitting}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </label>

      <button type="button" className={styles.linkBtn} onClick={onSwitchToForgot} disabled={submitting}>
        Forgot password?
      </button>

      {error && <p id={errorId} className={styles.error} role="alert">{error}</p>}

      <button
        type="submit"
        className={styles.button}
        disabled={submitting}
        aria-describedby={error && !errorField ? errorId : undefined}
      >
        {submitting ? 'Signing in…' : 'Sign In'}
      </button>

      <p className={styles.switchRow}>
        New to StreamFlow?{' '}
        <button type="button" className={styles.linkBtn} onClick={onSwitchToRegister} disabled={submitting}>
          Create an account
        </button>
      </p>
    </form>
  );
}
