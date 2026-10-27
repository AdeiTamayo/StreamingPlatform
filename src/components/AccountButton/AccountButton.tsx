import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useClickOutside from '../../hooks/useClickOutside';
import { useAuth } from '../../hooks/useAuth';
import styles from './AccountButton.module.css';

interface AccountButtonProps {
  sidebar?: boolean;
}

export default function AccountButton({ sidebar = false }: AccountButtonProps) {
  const { t } = useTranslation();
  const { isAuthenticated, openAuthModal, signOut, user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const rootRef = useClickOutside(() => setMenuOpen(false));

  useEffect(() => {
    if (menuOpen) {
      wasOpenRef.current = true;
      const timer = setTimeout(() => {
        menuRef.current?.querySelector<HTMLElement>('a, button')?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      btnRef.current?.focus();
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  if (!isAuthenticated) {
    return (
      <button
        type="button"
        className={sidebar ? styles.sidebarSignIn : styles.signInBtn}
        onClick={openAuthModal}
      >
        {t('account.signIn')}
      </button>
    );
  }

  const email = user?.email || '';
  const initial = email ? email[0].toUpperCase() : '?';
  const triggerLabel = email
    ? t('account.accountMenuFor', { email })
    : t('account.accountMenu');

  return (
    <div ref={rootRef} className={sidebar ? styles.sidebarAccount : styles.account}>
      <button
        ref={btnRef}
        type="button"
        className={sidebar ? styles.sidebarAvatarBtn : styles.avatarBtn}
        onClick={() => setMenuOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={triggerLabel}
      >
        <span className={styles.avatar} aria-hidden="true">{initial}</span>
        {sidebar && <span className={styles.avatarLabel}>{email || t('account.account')}</span>}
      </button>
      {menuOpen && (
        <div
          ref={menuRef}
          className={sidebar ? styles.sidebarMenu : styles.menu}
          role="menu"
          aria-label={t('account.account')}
        >
          <Link
            to="/settings"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => setMenuOpen(false)}
          >
            {t('account.settings')}
          </Link>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              setMenuOpen(false);
              void signOut();
            }}
          >
            {t('account.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
