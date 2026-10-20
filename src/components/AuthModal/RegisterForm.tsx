import { useState, type FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getErrorMessage, isValidEmail, validatePassword, MIN_PASSWORD_LENGTH } from './errors';
import styles from './AuthModal.module.css';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

type FieldName = 'email' | 'password' | 'confirm';

export default function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
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
      setError('Enter your email address.');
      setErrorField('email');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setError('Enter a valid email address.');
      setErrorField('email');
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      setErrorField('password');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
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
        <button type="button" className={styles.button} onClick={onSwitchToLogin} autoFocus>
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
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
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
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            disabled={submitting}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Confirm Password</span>
        <div className={styles.inputWrap}>
          <input
            type={showConfirmPassword ? 'text' : 'password'}
            className={styles.input}
            placeholder="Repeat your password"
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
            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showConfirmPassword}
            disabled={submitting}
          >
            {showConfirmPassword ? 'Hide' : 'Show'}
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
        {submitting ? 'Creating account…' : 'Create Account'}
      </button>

      <p className={styles.switchRow}>
        Already have an account?{' '}
        <button type="button" className={styles.linkBtn} onClick={onSwitchToLogin} disabled={submitting}>
          Sign in
        </button>
      </p>
    </form>
  );
}
