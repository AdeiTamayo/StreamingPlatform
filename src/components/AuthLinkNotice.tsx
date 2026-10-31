import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from './useToast';
import { useAuth } from '../hooks/useAuth';
import { initialAuthLink, stripAuthParams } from '../lib/authLink';
import { PASSWORD_RESET_PATH } from '../services/auth/authService';

// Renders nothing. Tells the user what happened when they arrived from an
// email link: a confirmed sign-up (they are signed in by the link), or a link
// that was expired or already used. Raw server text is never shown.
export default function AuthLinkNotice() {
  const { t } = useTranslation();
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const errorHandled = useRef(false);
  const confirmedShown = useRef(false);

  useEffect(() => {
    if (!initialAuthLink.hasError || errorHandled.current) return;
    errorHandled.current = true;
    // The reset page renders its own invalid-link state from the same fragment.
    if (window.location.pathname !== PASSWORD_RESET_PATH) {
      const known = initialAuthLink.errorCode === 'otp_expired' || initialAuthLink.errorCode === 'access_denied';
      toast?.(t(known ? 'auth.link.expired' : 'auth.errors.generic'), { kind: 'error', duration: 8000 });
      stripAuthParams();
    }
  }, [t, toast]);

  useEffect(() => {
    if (initialAuthLink.type !== 'signup' || !isAuthenticated || confirmedShown.current) return;
    confirmedShown.current = true;
    toast?.(t('auth.link.confirmed'), { kind: 'info' });
  }, [isAuthenticated, t, toast]);

  return null;
}
