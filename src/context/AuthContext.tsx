import { createContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User, Session } from '@supabase/supabase-js';
import { authService } from '../services/auth/authService';
import { dataMigration } from '../utils/dataMigration';
import { setCurrentUserId } from '../api/storage';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
}

export interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ user: User | null; session: Session | null }>;
  signUp: (email: string, password: string) => Promise<{ user: User | null; session: Session | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  syncVersion: number;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

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
      .finally(() => setSyncVersion((v) => v + 1));
  }, []);

  useEffect(() => {
    const { data: listener } = authService.onAuthStateChange((event, session) => {
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
    });

    authService.getSession().then((session) => {
      if (session?.user) {
        setCurrentUserId(session.user.id);
        setAuth(session.user, session);
        runMigration(session.user.id);
      } else {
        setCurrentUserId(null);
        setState((prev) => ({ ...prev, loading: false }));
      }
    });

    return () => {
      listener?.subscription.unsubscribe();
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
