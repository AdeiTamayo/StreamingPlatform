import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading, openAuthModal } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      openAuthModal();
      // Never leave the user on a blank page: bounce to home. The auth modal
      // stays available from the navbar if they change their mind.
      navigate('/', { replace: true });
    }
  }, [loading, isAuthenticated, openAuthModal, navigate]);

  if (loading || !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
