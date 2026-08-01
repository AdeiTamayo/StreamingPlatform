import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User, Session } from '@supabase/supabase-js';
import { authService } from '../services/auth/authService';
import { dataMigration } from '../utils/dataMigration';
import { setCurrentUserId } from '../api/storage';
import { logError } from '../utils/logger';
import { AuthContext, type AuthState } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    isAuthenticated: false,
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [syncVersion, setSyncVersion] = useState(0);
  const navigate = useNavigate();

  const openAuthModal = useCallback(() => {
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  const setAuth = useCallback((user: User | null, session: Session | null) => {
    setState({
      user,
      session,
      loading: false,
      isAuthenticated: !!user && !!session,
    });
  }, []);

  const runMigration = useCallback((userId: string) => {
    dataMigration
      .migrateFromLocalStorage(userId)
      .catch((err) => logError('dataMigration', err))
      .finally(() => setSyncVersion((v) => v + 1));
  }, []);

  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | undefined;

    try {
      subscription = authService.onAuthStateChange((event, session) => {
        if (!mounted) return;
        const supabaseSession = session as Session | null;
        if (event === 'SIGNED_IN' && supabaseSession?.user) {
          setCurrentUserId(supabaseSession.user.id);
          setAuth(supabaseSession.user, supabaseSession);
          setIsAuthModalOpen(false);
          runMigration(supabaseSession.user.id);
        } else if (event === 'SIGNED_OUT') {
          setCurrentUserId(null);
          setAuth(null, null);
        } else if (event === 'TOKEN_REFRESHED' && supabaseSession?.user) {
          setCurrentUserId(supabaseSession.user.id);
          setAuth(supabaseSession.user, supabaseSession);
        }
      }).data.subscription;
    } catch (err) {
      logError('auth.onAuthStateChange', err);
    }

    authService.getSession()
      .then((session) => {
        if (!mounted) return;
        if (session?.user) {
          setCurrentUserId(session.user.id);
          setAuth(session.user, session);
          runMigration(session.user.id);
        } else {
          setCurrentUserId(null);
          setState((prev) => ({ ...prev, loading: false }));
        }
      })
      .catch((err) => {
        logError('auth.getSession', err);
        if (!mounted) return;
        setCurrentUserId(null);
        setState((prev) => ({ ...prev, loading: false }));
      });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [setAuth, runMigration]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authService.signIn(email, password);
    if (result.user && result.session) {
      setAuth(result.user, result.session);
    }
    return result;
  }, [setAuth]);

  const signUp = useCallback(async (email: string, password: string) => {
    const result = await authService.signUp(email, password);
    if (result.user && result.session) {
      setAuth(result.user, result.session);
    }
    return result;
  }, [setAuth]);

  const signOut = useCallback(async () => {
    await authService.signOut();
    setAuth(null, null);
    navigate('/');
  }, [setAuth, navigate]);

  const resetPassword = useCallback(async (email: string) => {
    await authService.resetPassword(email);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        signUp,
        signOut,
        resetPassword,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        syncVersion,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
