import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading, openAuthModal } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      openAuthModal();
    }
  }, [loading, isAuthenticated, openAuthModal]);

  if (loading || !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
