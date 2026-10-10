/**
 * Pure helpers for the two-factor UI (sign-in challenge + Security settings).
 * No React, no network — unit-tested in __tests__/two-factor.test.ts.
 *
 * better-auth 1.5.6 semantics these encode:
 *  - `twoFactor.enable({ password })` only creates the secret + backup codes;
 *    2FA is NOT on until a code is verified with `twoFactor.verifyTotp` while
 *    signed in (that call flips `user.twoFactorEnabled`). Re-running enable
 *    replaces any earlier, unverified setup.
 *  - Sign-in with 2FA on returns `{ twoFactorRedirect: true }` instead of a
 *    session, plus a signed 10-minute challenge cookie that verifyTotp /
 *    verifyOtp / verifyBackupCode consume.
 */

export type TwoFactorMethod = 'totp' | 'otp' | 'backup';

/** Strip what people paste around a code ("123 456", "12-34-56", "code: 123456"). */
export function normalizeCode(method: TwoFactorMethod, raw: string): string {
  if (method === 'backup') {
    // Backup codes are "abcde-fghij" (alnum, case-sensitive). Keep the dash.
    return raw.trim().replace(/\s+/g, '');
  }
  return raw.replace(/\D/g, '').slice(0, 6);
}

export function isCodeComplete(method: TwoFactorMethod, code: string): boolean {
  if (method === 'backup') return /^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/.test(code);
  return /^\d{6}$/.test(code);
}

interface AuthErrorLike {
  code?: string;
  status?: number;
  message?: string;
}

/** A sentence a person can act on, for any error the 2FA endpoints return. */
export function twoFactorErrorMessage(err: AuthErrorLike | null | undefined): string {
  const code = err?.code ?? '';
  const status = err?.status;
  if (status === 429) return 'Too many tries. Wait a few seconds and try again.';
  switch (code) {
    case 'INVALID_CODE':
      return "That code didn't work. Check the time on your phone and use the newest code.";
    case 'INVALID_BACKUP_CODE':
      return "That backup code didn't work. Each code works only once.";
    case 'OTP_HAS_EXPIRED':
      return 'That email code expired. Send a new one.';
    case 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE':
      return 'Too many wrong codes. Send a new email code.';
    case 'INVALID_TWO_FACTOR_COOKIE':
      return 'This sign-in timed out. Go back and enter your password again.';
    case 'OTP_NOT_CONFIGURED':
    case 'OTP_NOT_ENABLED':
      return 'Email codes are not available on this server. Use your authenticator app or a backup code.';
    case 'INVALID_PASSWORD':
      return 'Wrong password.';
    default:
      return err?.message || 'Something went wrong. Please try again.';
  }
}

/** The challenge cookie is gone or expired — only a fresh password sign-in helps. */
export function isChallengeExpired(err: AuthErrorLike | null | undefined): boolean {
  return err?.code === 'INVALID_TWO_FACTOR_COOKIE';
}

/** Extract the base32 secret from an otpauth:// URI for manual entry. */
export function secretFromTotpUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get('secret') ?? '';
  } catch {
    return '';
  }
}

// --- Security settings: enable flow -----------------------------------------

export type SetupState =
  | { step: 'idle' }
  | { step: 'scan'; totpURI: string; secret: string; backupCodes: string[] }
  | { step: 'done'; backupCodes: string[] };

export type SetupAction =
  | { type: 'started'; totpURI: string; backupCodes: string[] }
  | { type: 'verified' }
  | { type: 'cancelled' }
  | { type: 'acknowledged' };

/**
 * idle → (password ok) scan → (code verified) done → (codes saved) idle.
 * "enabled" itself is never stored here — it comes from the session user, so
 * the badge can't claim 2FA is on before the server agrees (#299).
 */
export function setupReducer(state: SetupState, action: SetupAction): SetupState {
  switch (action.type) {
    case 'started':
      return { step: 'scan', totpURI: action.totpURI, secret: secretFromTotpUri(action.totpURI), backupCodes: action.backupCodes };
    case 'verified':
      return state.step === 'scan' ? { step: 'done', backupCodes: state.backupCodes } : state;
    case 'cancelled':
    case 'acknowledged':
      return { step: 'idle' };
    default:
      return state;
  }
}

/** Plain-text file body for "Download backup codes". */
export function backupCodesFile(codes: string[], email?: string, now = new Date()): string {
  return [
    'AIDJ backup codes',
    email ? `Account: ${email}` : null,
    `Created: ${now.toISOString().slice(0, 10)}`,
    '',
    'Each code works once. Use one if you lose your authenticator app.',
    '',
    ...codes,
    '',
  ].filter((l) => l !== null).join('\n');
}

