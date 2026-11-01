import { createContext } from 'react';
import type { User, Session } from '@supabase/supabase-js';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
}

export type SessionLossReason = 'deleted' | 'ended';

export interface SessionLoss {
  reason: SessionLossReason;
  /** Increments for every loss so a repeat of the same reason is still noticed. */
  id: number;
}

export interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ user: User | null; session: Session | null }>;
  signUp: (email: string, password: string) => Promise<{ user: User | null; session: Session | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Re-authenticates with the current password, then sets a new one. Rejects with a coded error. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Requests an email change; the address only changes after the user confirms by email. */
  changeEmail: (newEmail: string) => Promise<void>;
  /**
   * Permanently deletes the account and all cloud data, then clears local data
   * and signs out locally. Password accounts pass their current password.
   * Rejects with a coded error and changes nothing locally if deletion fails.
   */
  deleteAccount: (currentPassword?: string) => Promise<void>;
  /** True after the user opened a password-reset email link, until they set a new password or skip. */
  isPasswordRecovery: boolean;
  /** Sets the new password for the recovery session and ends recovery mode. */
  updatePassword: (newPassword: string) => Promise<void>;
  /** Leaves recovery mode without changing the password (the session stays signed in). */
  endPasswordRecovery: () => void;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  syncVersion: number;
  /** Set when this session was ended from outside (deleted account, revoked session). */
  sessionLoss: SessionLoss | null;
  /**
   * Ends the local session after the server reported it dead. 'deleted' also
   * discards the pending offline queue, which belongs to an account that no
   * longer exists and can never be replayed.
   */
  endSession: (reason: SessionLossReason) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
