import { getConfig } from '@/lib/config/config';
import { mobileOptimization } from '@/lib/performance/mobile-optimization';
import { ServiceError } from '../../utils';
import type { SubsonicCreds } from './types';

// Pure JS MD5 for Subsonic API auth lives in utils/md5 (shared with navidrome-id), re-exported here
import { md5Pure } from '@/lib/utils/md5';
export { md5Pure };

// --- Auth state ---

let token: string | null = null;
export { token };
let clientId: string | null = null;
export { clientId };
let subsonicToken: string | null = null;
export { subsonicToken };
let subsonicSalt: string | null = null;
export { subsonicSalt };
/** Username the current token was issued for (from the login response). */
let authUsername: string | null = null;
export { authUsername };
let tokenExpiry = 0;
export { tokenExpiry };

// --- Rate limiting ---

const requestQueue = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 120;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  if (!requestQueue.has(key)) {
    requestQueue.set(key, [now]);
    return true;
  }

  const requests = requestQueue.get(key)!;
  const validRequests = requests.filter(timestamp => timestamp > windowStart);

  if (validRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  validRequests.push(now);
  requestQueue.set(key, validRequests);
  return true;
}

/**
 * Wait until rate limit allows another request
 * Returns the time waited in ms
 */
export async function waitForRateLimit(key: string, maxWaitMs: number = 5000): Promise<number> {
  const startTime = Date.now();

  while (!checkRateLimit(key)) {
    const waited = Date.now() - startTime;
    if (waited >= maxWaitMs) {
      throw new ServiceError('RATE_LIMIT_ERROR', 'Rate limit wait exceeded maximum time');
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return Date.now() - startTime;
}

// --- Auth ---

let pendingAuth: Promise<string> | null = null;

export function resetAuthState() {
  token = null;
  clientId = null;
  subsonicToken = null;
  subsonicSalt = null;
  authUsername = null;
  tokenExpiry = 0;
  pendingAuth = null;
}

/**
 * Build a URL for direct Subsonic API calls with optional per-user creds.
 * If creds are provided, uses those instead of the admin credentials.
 */
export function buildSubsonicUrl(endpoint: string, creds?: SubsonicCreds): URL {
  const config = getConfig();
  const url = new URL(`${config.navidromeUrl}/rest/${endpoint}`);
  url.searchParams.set('u', creds?.username || authUsername || config.navidromeUsername || '');
  url.searchParams.set('t', creds?.token || subsonicToken || '');
  url.searchParams.set('s', creds?.salt || subsonicSalt || '');
  url.searchParams.set('v', '1.16.1');
  url.searchParams.set('c', 'aidj');
  url.searchParams.set('f', 'json');
  return url;
}

/**
 * Check if we're running in a browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

/**
 * Get the base URL for API calls
 * In browser: use the proxy at /api/navidrome
 * On server: use direct Navidrome URL
 */
function getApiBaseUrl(): string {
  if (isBrowser()) {
    return '/api/navidrome';
  }
  const config = getConfig();
  return config.navidromeUrl || '';
}

const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes before expiry

export async function getAuthToken(): Promise<string> {
  const config = getConfig();
  if (!config.navidromeUrl) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
  }

  const username = config.navidromeUsername;
  const password = config.navidromePassword;
  // In the browser the login proxy authenticates with the server's own env
  // credentials, so missing client-side credentials are expected (they were
  // stripped from defaults.json). Only the server-side direct path needs them.
  if (!isBrowser() && (!username || !password)) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome credentials incomplete');
  }

  const now = Date.now();
  if (token && now < tokenExpiry - TOKEN_REFRESH_THRESHOLD && subsonicToken && subsonicSalt) {
    return token;
  }

  // Dedup concurrent auth requests — all callers await the same promise
  if (pendingAuth) {
    return pendingAuth;
  }

  pendingAuth = performAuth(config.navidromeUrl, username, password).finally(() => {
    pendingAuth = null;
  });

  return pendingAuth;
}

async function performAuth(navidromeUrl: string, username: string, password: string): Promise<string> {
  const adaptiveTimeout = mobileOptimization.getAdaptiveTimeout();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), adaptiveTimeout);

  const authUrl = isBrowser()
    ? '/api/navidrome/auth/login'
    : `${navidromeUrl}/auth/login`;

  try {
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response?.ok) {
      throw new ServiceError('NAVIDROME_AUTH_ERROR', `Login failed: ${response?.statusText ?? 'unknown error'}`);
    }

    const data = await response.json();
    if (!data.token || !data.id) {
      throw new ServiceError('NAVIDROME_AUTH_ERROR', 'No token or id received from login');
    }
    token = data.token as string;
    clientId = data.id as string;
    authUsername = (data.username as string) || username || null;

    // Navidrome's login response includes ready-made Subsonic credentials —
    // prefer those so the client never needs the raw password. Fall back to
    // computing them locally only when we do hold the password (server path).
    if (data.subsonicToken && data.subsonicSalt) {
      subsonicToken = data.subsonicToken as string;
      subsonicSalt = data.subsonicSalt as string;
    } else if (password) {
      const salt = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      subsonicToken = md5Pure(password + salt);
      subsonicSalt = salt;
    } else {
      subsonicToken = null;
      subsonicSalt = null;
    }

    tokenExpiry = Date.now() + 3600 * 1000;
    return token as string;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ServiceError('NAVIDROME_TIMEOUT_ERROR', `Login request timed out (${adaptiveTimeout}ms)`);
    }
    throw new ServiceError('NAVIDROME_AUTH_ERROR', `Authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// --- Retry & fetch ---

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  isRetriable: (error: Error | ServiceError) => boolean = () => true
): Promise<T> {
  let lastError: Error | ServiceError | null = null;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetriable(lastError)) {
        throw lastError;
      }

      if (attempt > maxRetries) {
        throw lastError;
      }

      const delay = Math.pow(2, attempt - 1) * 500;
      console.log(`🔄 Navidrome retry attempt ${attempt}/${maxRetries + 1} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError ?? new Error('Retry failed with no error');
}

export async function apiFetch<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  let authRetries = 0;
  const maxAuthRetries = 1;

  while (authRetries <= maxAuthRetries) {
    const authToken = await getAuthToken();

    try {
      return await retryWithBackoff(
        async () => {
          const adaptiveTimeout = mobileOptimization.getAdaptiveTimeout();
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), adaptiveTimeout);

          try {
            const config = getConfig();
            const ndId = clientId;
            if (!ndId) {
              throw new ServiceError('NAVIDROME_CLIENT_ERROR', 'Client ID not available');
            }

            const baseUrl = getApiBaseUrl();
            let url = `${baseUrl}${endpoint}`;
            let headers: Record<string, string> = {};
            if (options.headers) {
              if (options.headers instanceof Headers) {
                options.headers.forEach((value, key) => {
                  headers[key] = value;
                });
              } else if (typeof options.headers === 'object') {
                Object.assign(headers, options.headers);
              }
            }

            if (endpoint.startsWith('/rest/')) {
              const params = new URLSearchParams({
                u: authUsername || config.navidromeUsername || ndId,
                t: subsonicToken || '',
                s: subsonicSalt || '',
                v: '1.16.1',
                f: 'json',
                c: 'MusicApp',
              });
              if (url.includes('?')) {
                url += `&${params.toString()}`;
              } else {
                url += `?${params.toString()}`;
              }
            } else {
              headers = {
                'x-nd-authorization': `Bearer ${authToken}`,
                'x-nd-client-unique-id': ndId,
                ...headers,
              };
            }

            const response = await fetch(url, {
              ...options,
              headers,
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (response?.status === 401) {
              token = null;
              clientId = null;
              authRetries++;
              throw new ServiceError('NAVIDROME_AUTH_RETRY', 'Auth token expired, retrying with new token');
            }

            if (!response?.ok) {
              const isRetriable = (response?.status ?? 0) >= 500;
              const error = new ServiceError(
                'NAVIDROME_API_ERROR',
                `API request failed: ${response?.status ?? 'unknown'} ${response?.statusText ?? 'unknown error'}`
              );
              throw Object.assign(error, { isRetriable });

            }

            if (!response) {
              throw new ServiceError('NAVIDROME_NETWORK_ERROR', 'No response received from server');
            }

            const contentType = response.headers?.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              return await response.json() as T;
            }
            if (typeof response.json === 'function') {
              return await response.json() as T;
            }
            if (typeof response.text === 'function') {
              return await response.text() as T;
            }
            return response as T;
          } catch (error: unknown) {
            clearTimeout(timeoutId);

            if (error instanceof Error && error.name === 'AbortError') {
              throw Object.assign(
                new ServiceError('NAVIDROME_TIMEOUT_ERROR', `API request timed out (${adaptiveTimeout}ms limit)`),
                { isRetriable: true }
              );
            }

            if (error instanceof TypeError && error.message.includes('fetch')) {
              throw Object.assign(
                new ServiceError('NAVIDROME_NETWORK_ERROR', 'Network request failed'),
                { isRetriable: true }
              );
            }

            throw error;
          }
        },
        2,
        (error) => {
          if (error instanceof ServiceError && error.code === 'NAVIDROME_AUTH_RETRY') {
            return false;
          }
          return (error as Error & { isRetriable?: boolean }).isRetriable === true;
        }
      );
    } catch (error: unknown) {
      if (error instanceof ServiceError && error.code === 'NAVIDROME_AUTH_RETRY') {
        if (authRetries <= maxAuthRetries) {
          continue;
        }
      }

      if (authRetries < maxAuthRetries && error instanceof ServiceError && error.code === 'NAVIDROME_API_ERROR') {
        authRetries++;
        continue;
      }

      throw error;
    }
  }

  throw new ServiceError('NAVIDROME_FETCH_ERROR', 'Max retries exceeded for API request');
}

/**
 * Check if Navidrome server is available
 */
export async function checkNavidromeConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const config = getConfig();
      const response = await fetch(`${config.navidromeUrl}/rest/ping?v=1.16.1&c=MusicApp&f=json`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      return response.ok;
    } catch {
      clearTimeout(timeoutId);
      return false;
    }
  } catch {
    return false;
  }
}
