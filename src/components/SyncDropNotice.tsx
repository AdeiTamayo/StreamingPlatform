import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from './useToast';
import { SYNC_DROPPED_EVENT, getDroppedCount } from '../utils/offlineQueue';

// Renders nothing. Tells the user when changes could not be synced and were
// dropped from the offline queue, instead of leaving local and cloud data to
// diverge silently. Also fires once on startup if an earlier session left
// unsynced changes behind, since the drop itself happened while nobody watched.
export default function SyncDropNotice() {
  const { t } = useTranslation();
  const toast = useToast();

  useEffect(() => {
    const warn = () => toast?.(t('toast.syncDropped'), { kind: 'error', duration: 8000 });
    if (getDroppedCount() > 0) warn();
    window.addEventListener(SYNC_DROPPED_EVENT, warn);
    return () => window.removeEventListener(SYNC_DROPPED_EVENT, warn);
    // toast identity is stable per provider; re-subscribing on language change
    // (t) is intended so the message is in the active language.
  }, [t, toast]);

  return null;
}
