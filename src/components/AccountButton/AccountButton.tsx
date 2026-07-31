import { useAuth } from '../../hooks/useAuth';
import styles from './AccountButton.module.css';

interface AccountButtonProps {
  sidebar?: boolean;
}

export default function AccountButton({ sidebar = false }: AccountButtonProps) {
  const { isAuthenticated, openAuthModal } = useAuth();

  if (isAuthenticated) {
    return null;
  }

  return (
    <button
      type="button"
      className={sidebar ? styles.sidebarSignIn : styles.signInBtn}
      onClick={openAuthModal}
    >
      Sign In
    </button>
  );
}
