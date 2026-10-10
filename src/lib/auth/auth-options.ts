/**
 * Which sign-in options this deployment actually offers.
 *
 * One source of truth for both the better-auth config (`auth.ts`) and the
 * public `/api/auth-options` flags the login and 2FA pages read, so the UI can
 * never show a button the server didn't register (#300: GitHub/Google buttons
 * were always rendered, and tapping one failed with "Provider not found").
 *
 * Pure: takes the env values, returns plain data. The public shape is booleans
 * only — never return a client id, secret or address from here.
 */

export interface AuthOptionsEnv {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}

export interface PublicAuthOptions {
  github: boolean;
  google: boolean;
  /** Email one-time codes as a 2FA method (needs a working sender). */
  emailOtp: boolean;
}

const set = (v: string | undefined) => !!v && v.trim().length > 0;

export function getAuthOptions(e: AuthOptionsEnv): PublicAuthOptions {
  return {
    github: set(e.GITHUB_CLIENT_ID) && set(e.GITHUB_CLIENT_SECRET),
    google: set(e.GOOGLE_CLIENT_ID) && set(e.GOOGLE_CLIENT_SECRET),
    // Without RESEND_FROM_EMAIL the sender falls back to noreply@localhost,
    // which Resend rejects — offering "email me a code" would then send nothing.
    emailOtp: set(e.RESEND_API_KEY) && set(e.RESEND_FROM_EMAIL),
  };
}

/**
 * better-auth `socialProviders` for the configured providers, or undefined
 * when none are. Each provider is independent (previously Google was only
 * registered when GitHub was too).
 */
export function buildSocialProviders(e: AuthOptionsEnv) {
  const opts = getAuthOptions(e);
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};
  if (opts.github) providers.github = { clientId: e.GITHUB_CLIENT_ID!, clientSecret: e.GITHUB_CLIENT_SECRET! };
  if (opts.google) providers.google = { clientId: e.GOOGLE_CLIENT_ID!, clientSecret: e.GOOGLE_CLIENT_SECRET! };
  return Object.keys(providers).length ? providers : undefined;
}
