import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User, Session } from '@supabase/supabase-js';
import { authService, PASSWORD_RESET_PATH } from '../services/auth/authService';
import { dataMigration } from '../utils/dataMigration';
import { setCurrentUserId, clearAllData } from '../api/storage';
import { clearTMDBCache } from '../api/tmdbCache';
import { clearOfflineQueue, clearDroppedMarker } from '../utils/offlineQueue';
import { logError } from '../utils/logger';
import { AuthContext, type AuthState, type SessionLoss, type SessionLossReason } from './auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    isAuthenticated: false,
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [syncVersion, setSyncVersion] = useState(0);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [sessionLoss, setSessionLoss] = useState<SessionLoss | null>(null);
  // True while a sign-out this app started is in flight. A SIGNED_OUT event
  // outside that window means the session was ended from elsewhere (revoked,
  // refresh token rejected, signed out in another tab).
  const expectedSignOut = useRef(false);
  const lossCounter = useRef(0);
  const navigate = useNavigate();
  // Under BrowserRouter useNavigate's identity changes with the location. The
  // auth subscription must not be torn down and re-created on every
  // navigation, so the handler reads the latest navigate through a ref.
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

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
          if (!expectedSignOut.current) {
            setSessionLoss({ reason: 'ended', id: ++lossCounter.current });
            navigateRef.current('/', { replace: true });
          }
        } else if (event === 'PASSWORD_RECOVERY' && supabaseSession?.user) {
          // The reset link signs the user in with a recovery session but emits
          // PASSWORD_RECOVERY instead of SIGNED_IN. Without handling it they
          // end up logged in with no way to choose a new password. Migration is
          // left to the getSession() path below, which also runs on this load.
          setCurrentUserId(supabaseSession.user.id);
          setAuth(supabaseSession.user, supabaseSession);
          setIsAuthModalOpen(false);
          setIsPasswordRecovery(true);
          // Works even when Supabase fell back to the Site URL because the
          // reset path is not in its redirect allow-list.
          navigateRef.current(PASSWORD_RESET_PATH, { replace: true });
        } else if (event === 'USER_UPDATED' && supabaseSession?.user) {
          // Fired after updateUser and after the user confirms an email
          // change: refresh the user so the displayed email follows the session.
          setCurrentUserId(supabaseSession.user.id);
          setAuth(supabaseSession.user, supabaseSession);
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

  // Sign-in/out wire the storage-layer user id and the local->cloud
  // migration directly instead of relying solely on the auth-state event:
  // if SIGNED_IN/SIGNED_OUT is ever missed, remote writes (search history,
  // notifications, ...) would silently stay local-only and the Supabase
  // tables would stay empty while the UI looks logged in.
  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authService.signIn(email, password);
    if (result.user && result.session) {
      setCurrentUserId(result.user.id);
      setAuth(result.user, result.session);
      runMigration(result.user.id);
    }
    return result;
  }, [setAuth, runMigration]);

  const signUp = useCallback(async (email: string, password: string) => {
    const result = await authService.signUp(email, password);
    if (result.user && result.session) {
      setCurrentUserId(result.user.id);
      setAuth(result.user, result.session);
      runMigration(result.user.id);
    }
    return result;
  }, [setAuth, runMigration]);

  const updatePassword = useCallback(async (newPassword: string) => {
    await authService.updatePassword(newPassword);
    setIsPasswordRecovery(false);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await authService.changePassword(currentPassword, newPassword);
  }, []);

  const changeEmail = useCallback(async (newEmail: string) => {
    await authService.changeEmail(newEmail);
  }, []);

  const endPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
  }, []);

  const signOut = useCallback(async () => {
    // A failed remote sign-out (expired token, offline) must not strand the
    // user signed in locally: clear local state and the storage-layer user id
    // regardless, then surface the remote failure only in the log.
    expectedSignOut.current = true;
    try {
      await authService.signOut();
    } catch (err) {
      logError('auth.signOut', err);
    } finally {
      expectedSignOut.current = false;
      setCurrentUserId(null);
      setAuth(null, null);
      setIsPasswordRecovery(false);
      navigate('/');
    }
  }, [setAuth, navigate]);

  const endSession = useCallback(async (reason: SessionLossReason) => {
    if (reason === 'deleted') {
      // The account is gone: its queued writes can never be replayed, and
      // leaving them would only waste queue space.
      clearOfflineQueue();
      clearDroppedMarker();
    }
    // Set before signing out so the notice survives the state reset below.
    setSessionLoss({ reason, id: ++lossCounter.current });
    await signOut();
  }, [signOut]);

  const deleteAccount = useCallback(async (currentPassword?: string) => {
    // Throws before anything local is touched: a failed deletion leaves the
    // user signed in with their data intact.
    await authService.deleteAccount(currentPassword);

    // The account no longer exists. Drop the storage-layer user id first so
    // clearAllData() stays local instead of firing cloud deletes (and queueing
    // them as "failed" writes) for a user that is gone.
    setCurrentUserId(null);
    try {
      await clearAllData();
      await clearTMDBCache();
    } catch (err) {
      logError('auth.deleteAccount.clearLocal', err);
    }
    clearOfflineQueue();
    clearDroppedMarker();
    // Local sign-out. The remote call may fail now that the user is gone;
    // signOut already tolerates that, and it navigates home.
    await signOut();
  }, [signOut]);

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
        deleteAccount,
        isPasswordRecovery,
        updatePassword,
        changePassword,
        changeEmail,
        endPasswordRecovery,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        syncVersion,
        sessionLoss,
        endSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
