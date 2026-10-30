import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import CloseIcon from '../CloseIcon';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import ForgotPasswordForm from './ForgotPasswordForm';
import styles from './AuthModal.module.css';

type AuthMode = 'login' | 'register' | 'forgot';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

const MODE_KEYS: Record<AuthMode, { title: string; subtitle: string }> = {
  login: { title: 'auth.signInTitle', subtitle: 'auth.signInSubtitle' },
  register: { title: 'auth.registerTitle', subtitle: 'auth.registerSubtitle' },
  forgot: { title: 'auth.forgotTitle', subtitle: 'auth.forgotSubtitle' },
};

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export default function AuthModal() {
  const { t } = useTranslation();
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

      const focusables = getFocusable(modalRef.current);

      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && (document.activeElement === first || document.activeElement === modalRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // Keep focus inside the dialog even if something moves it out (e.g. a
    // browser autofill or an off-dialog control grabbing focus).
    const handleFocusIn = (e: FocusEvent) => {
      if (!modalRef.current) return;
      if (!modalRef.current.contains(e.target as Node)) {
        const focusables = getFocusable(modalRef.current);
        (focusables[0] ?? modalRef.current).focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      triggerRef.current?.focus();
    };
  }, [isAuthModalOpen, closeAuthModal]);

  // On open (and whenever the mode changes) land focus on the first field,
  // falling back to the dialog itself if the current view has no field.
  useEffect(() => {
    if (!isAuthModalOpen) return;
    const target = modalRef.current?.querySelector<HTMLElement>('input, textarea, select');
    (target ?? modalRef.current)?.focus();
  }, [isAuthModalOpen, mode]);

  if (!isAuthModalOpen) return null;

  const { title, subtitle } = MODE_KEYS[mode];
  const titleText = t(title);

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
          aria-label={t('auth.closeDialog', { title: titleText })}
        >
          <CloseIcon size={18} />
        </button>

        <h2 className={styles.title} id="auth-modal-title">
          {titleText}
        </h2>
        <p className={styles.subtitle}>{t(subtitle)}</p>

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
