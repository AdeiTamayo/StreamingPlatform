import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import ForgotPasswordForm from './ForgotPasswordForm';
import styles from './AuthModal.module.css';

type AuthMode = 'login' | 'register' | 'forgot';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

const MODE_TITLES: Record<AuthMode, { title: string; subtitle: string }> = {
  login: { title: 'Sign In', subtitle: 'Welcome back. Sign in to sync your library.' },
  register: { title: 'Create Account', subtitle: 'Sync your watch history across devices.' },
  forgot: { title: 'Reset Password', subtitle: 'We will email you a link to reset it.' },
};

export default function AuthModal() {
  const { isAuthModalOpen, closeAuthModal } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isAuthModalOpen) return;

    setMode('login');
    triggerRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeAuthModal();
        return;
      }
      if (e.key !== 'Tab' || !modalRef.current) return;

      const focusables = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [isAuthModalOpen, closeAuthModal]);

  if (!isAuthModalOpen) return null;

  const { title, subtitle } = MODE_TITLES[mode];

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeAuthModal();
      }}
    >
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        tabIndex={-1}
      >
        <button
          type="button"
          className={styles.closeBtn}
          onClick={closeAuthModal}
          aria-label="Close sign in dialog"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>

        <h2 className={styles.title} id="auth-modal-title">
          {title}
        </h2>
        <p className={styles.subtitle}>{subtitle}</p>

        <div className={styles.body}>
          {mode === 'login' && (
            <LoginForm
              onSwitchToRegister={() => setMode('register')}
              onSwitchToForgot={() => setMode('forgot')}
            />
          )}
          {mode === 'register' && (
            <RegisterForm onSwitchToLogin={() => setMode('login')} />
          )}
          {mode === 'forgot' && (
            <ForgotPasswordForm onSwitchToLogin={() => setMode('login')} />
          )}
        </div>
      </div>
    </div>
  );
}
