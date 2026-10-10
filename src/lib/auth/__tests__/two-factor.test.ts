import { describe, it, expect } from 'vitest';
import {
  backupCodesFile,
  isChallengeExpired,
  isCodeComplete,
  normalizeCode,
  secretFromTotpUri,
  setupReducer,
  twoFactorErrorMessage,
  type SetupState,
} from '../two-factor';
import { buildSocialProviders, getAuthOptions } from '../auth-options';

describe('normalizeCode / isCodeComplete', () => {
  it('strips spaces, dashes and labels from 6-digit codes and caps at 6', () => {
    expect(normalizeCode('totp', '123 456')).toBe('123456');
    expect(normalizeCode('otp', 'code: 12-34-56')).toBe('123456');
    expect(normalizeCode('totp', '1234567')).toBe('123456');
  });

  it('keeps backup codes case and dash', () => {
    expect(normalizeCode('backup', ' aBcDe-12345 ')).toBe('aBcDe-12345');
  });

  it('only accepts complete codes', () => {
    expect(isCodeComplete('totp', '12345')).toBe(false);
    expect(isCodeComplete('totp', '123456')).toBe(true);
    expect(isCodeComplete('backup', 'abcde-12345')).toBe(true);
    expect(isCodeComplete('backup', 'abcde12345')).toBe(true);
    expect(isCodeComplete('backup', 'abc')).toBe(false);
  });
});

describe('twoFactorErrorMessage', () => {
  it('turns better-auth error codes into actionable sentences', () => {
    expect(twoFactorErrorMessage({ code: 'INVALID_CODE' })).toMatch(/didn't work/);
    expect(twoFactorErrorMessage({ code: 'OTP_HAS_EXPIRED' })).toMatch(/expired/);
    expect(twoFactorErrorMessage({ code: 'INVALID_TWO_FACTOR_COOKIE' })).toMatch(/password again/);
    expect(twoFactorErrorMessage({ status: 429 })).toMatch(/Too many tries/);
  });

  it('falls back to the server message, then a generic one', () => {
    expect(twoFactorErrorMessage({ code: 'WHATEVER', message: 'Boom' })).toBe('Boom');
    expect(twoFactorErrorMessage(null)).toMatch(/Something went wrong/);
  });

  it('flags an expired sign-in challenge (needs a fresh password step)', () => {
    expect(isChallengeExpired({ code: 'INVALID_TWO_FACTOR_COOKIE' })).toBe(true);
    expect(isChallengeExpired({ code: 'INVALID_CODE' })).toBe(false);
  });
});

describe('setupReducer (#299: on only after a verified code)', () => {
  const uri = 'otpauth://totp/AIDJ:juan@example.com?secret=JBSWY3DPEHPK3PXP&issuer=AIDJ';
  const idle: SetupState = { step: 'idle' };

  it('idle → scan carries the QR, the manual secret and the backup codes', () => {
    const s = setupReducer(idle, { type: 'started', totpURI: uri, backupCodes: ['a', 'b'] });
    expect(s).toEqual({ step: 'scan', totpURI: uri, secret: 'JBSWY3DPEHPK3PXP', backupCodes: ['a', 'b'] });
  });

  it('only a verified code moves scan → done', () => {
    const scan = setupReducer(idle, { type: 'started', totpURI: uri, backupCodes: ['a'] });
    expect(setupReducer(scan, { type: 'verified' })).toEqual({ step: 'done', backupCodes: ['a'] });
    expect(setupReducer(idle, { type: 'verified' })).toEqual(idle);
  });

  it('cancel and acknowledge return to idle (an abandoned setup can simply be started again)', () => {
    const scan = setupReducer(idle, { type: 'started', totpURI: uri, backupCodes: [] });
    expect(setupReducer(scan, { type: 'cancelled' })).toEqual(idle);
    const again = setupReducer(setupReducer(scan, { type: 'cancelled' }), { type: 'started', totpURI: uri, backupCodes: ['x'] });
    expect(again.step).toBe('scan');
  });

  it('secretFromTotpUri tolerates junk', () => {
    expect(secretFromTotpUri('not a uri')).toBe('');
  });
});

describe('small helpers', () => {
  it('backupCodesFile lists every code', () => {
    const f = backupCodesFile(['aaaaa-11111', 'bbbbb-22222'], 'me@x.com', new Date('2026-10-06T00:00:00Z'));
    expect(f).toContain('aaaaa-11111');
    expect(f).toContain('bbbbb-22222');
    expect(f).toContain('me@x.com');
    expect(f).toContain('2026-10-06');
  });

});

describe('getAuthOptions / buildSocialProviders (#300)', () => {
  it('nothing configured → no social buttons, no email codes', () => {
    expect(getAuthOptions({})).toEqual({ github: false, google: false, emailOtp: false });
    expect(buildSocialProviders({})).toBeUndefined();
  });

  it('a provider needs both id and secret', () => {
    expect(getAuthOptions({ GITHUB_CLIENT_ID: 'id' }).github).toBe(false);
    expect(getAuthOptions({ GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: ' ' }).github).toBe(false);
  });

  it('Google works without GitHub (it used to be nested under it)', () => {
    const e = { GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 's' };
    expect(getAuthOptions(e)).toEqual({ github: false, google: true, emailOtp: false });
    expect(Object.keys(buildSocialProviders(e)!)).toEqual(['google']);
  });

  it('email codes need an API key AND a real from-address', () => {
    expect(getAuthOptions({ RESEND_API_KEY: 'k' }).emailOtp).toBe(false);
    expect(getAuthOptions({ RESEND_API_KEY: 'k', RESEND_FROM_EMAIL: 'no-reply@x.com' }).emailOtp).toBe(true);
  });

  it('the public shape is booleans only — no ids, secrets or addresses leak', () => {
    const out = getAuthOptions({
      GITHUB_CLIENT_ID: 'gh-id', GITHUB_CLIENT_SECRET: 'gh-secret',
      GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret',
      RESEND_API_KEY: 're_key', RESEND_FROM_EMAIL: 'no-reply@x.com',
    });
    expect(Object.values(out).every((v) => typeof v === 'boolean')).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/secret|gh-id|re_key|x\.com/);
  });
});
