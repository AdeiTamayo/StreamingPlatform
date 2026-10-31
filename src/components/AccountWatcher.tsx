import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from './useToast';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services/auth/authService';
import { logError } from '../utils/logger';

// A session check costs a request, so triggers are rate limited.
export const MIN_CHECK_INTERVAL_MS = 30_000;
export const CHECK_INTERVAL_MS = 5 * 60_000;

// Renders nothing. Other devices keep showing a user as signed in after the
// account is deleted (or the session revoked) until something fails. This asks
// the Auth server whether the session is still valid when the tab regains focus
// or becomes visible, and every few minutes while it stays visible, and signs
// out locally when the server proves the account or session is gone. A network
// or server error never signs anyone out. It also tells the user why they were
// signed out.
export default function AccountWatcher() {
  const { t } = useTranslation();
  const toast = useToast();
  const { isAuthenticated, sessionLoss, endSession } = useAuth();
  const endSessionRef = useRef(endSession);
  useEffect(() => {
    endSessionRef.current = endSession;
  }, [endSession]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    let inFlight = false;
    let lastCheck = 0;

    const check = async () => {
      if (inFlight || document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastCheck < MIN_CHECK_INTERVAL_MS) return;
      lastCheck = now;
      inFlight = true;
      try {
        const result = await authService.verifySession();
        if (!cancelled && (result === 'deleted' || result === 'ended')) {
          await endSessionRef.current(result);
        }
      } catch (err) {
        logError('auth.verifySession', err);
      } finally {
        inFlight = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check();
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!sessionLoss) return;
    toast?.(t(sessionLoss.reason === 'deleted' ? 'toast.accountGone' : 'toast.sessionEnded'), {
      kind: 'info',
      duration: 8000,
    });
    // One notice per loss; t is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoss?.id]);

  return null;
}
