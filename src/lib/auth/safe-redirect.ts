/**
 * Where to send someone after they log in (#341).
 *
 * Protected routes bounce logged-out visitors to `/login?redirect=<where they were going>`.
 * That value comes from the URL, so it is untrusted: only same-origin, relative app paths
 * are accepted — never another site (`//evil.example`, `https://…`, `/\evil.example`),
 * never an auth page (redirect loops) and never an API route. Anything else falls back.
 */
export const DEFAULT_AFTER_LOGIN = "/dashboard";

const AUTH_PAGES = ["/login", "/signup", "/two-factor", "/forgot-password", "/reset-password"];
const PROBE_ORIGIN = "http://aidj.invalid";

export function safeRedirectPath(raw: unknown, fallback: string = DEFAULT_AFTER_LOGIN): string {
  if (typeof raw !== "string") return fallback;
  const s = raw.trim();
  if (!s || s.length > 2048) return fallback;
  // Relative to this origin only. Browsers treat "\" like "/", so "/\evil.example" is
  // protocol-relative too — reject backslashes and control characters outright.
  if (!s.startsWith("/") || s.startsWith("//")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(s)) return fallback;

  let url: URL;
  try {
    url = new URL(s, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) return fallback;

  const path = url.pathname;
  if (AUTH_PAGES.some((p) => path === p || path.startsWith(`${p}/`))) return fallback;
  if (path === "/api" || path.startsWith("/api/")) return fallback;

  return `${path}${url.search}${url.hash}`;
}

/** `path` plus `?redirect=<target>` when the target isn't the default (keeps URLs clean). */
export function withRedirectParam(path: string, target: string): string {
  if (target === DEFAULT_AFTER_LOGIN) return path;
  return `${path}?redirect=${encodeURIComponent(target)}`;
}
