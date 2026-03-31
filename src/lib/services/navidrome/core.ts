import { getConfig } from '@/lib/config/config';
import { mobileOptimization } from '@/lib/performance/mobile-optimization';
import { ServiceError } from '../../utils';
import type { SubsonicCreds } from './types';

// Pure JS MD5 implementation for Subsonic API auth (cross-platform compatible)
export function md5Pure(string: string): string {
  function md5cycle(x: number[], k: number[]) {
    let a = x[0], b = x[1], c = x[2], d = x[3];

    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);

    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);

    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);

    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);

    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);
  }

  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }

  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | ((~b) & d), a, b, x, s, t);
  }

  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & (~d)), a, b, x, s, t);
  }

  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | (~d)), a, b, x, s, t);
  }

  function md51(s: string) {
    const n = s.length;
    const state = [1732584193, -271733879, -1732584194, 271733878];
    let i: number;
    for (i = 64; i <= s.length; i += 64) {
      md5cycle(state, md5blk(s.substring(i - 64, i)));
    }
    s = s.substring(i - 64);
    const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < s.length; i++)
      tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) {
      md5cycle(state, tail);
      for (i = 0; i < 16; i++) tail[i] = 0;
    }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }

  function md5blk(s: string) {
    const md5blks = [];
    for (let i = 0; i < 64; i += 4) {
      md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    }
    return md5blks;
  }

  const hex_chr = '0123456789abcdef'.split('');

  function rhex(n: number) {
    let s = '';
    for (let j = 0; j < 4; j++)
      s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F];
    return s;
  }

  function hex(x: number[]) {
    return x.map(rhex).join('');
  }

  function add32(a: number, b: number) {
    return (a + b) & 0xFFFFFFFF;
  }

  return hex(md51(string));
}

// --- Auth state ---

let token: string | null = null;
export { token };
let clientId: string | null = null;
export { clientId };
let subsonicToken: string | null = null;
export { subsonicToken };
let subsonicSalt: string | null = null;
export { subsonicSalt };
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

export function resetAuthState() {
  token = null;
  clientId = null;
  subsonicToken = null;
  subsonicSalt = null;
  tokenExpiry = 0;
}

/**
 * Build a URL for direct Subsonic API calls with optional per-user creds.
 * If creds are provided, uses those instead of the admin credentials.
 */
export function buildSubsonicUrl(endpoint: string, creds?: SubsonicCreds): URL {
  const config = getConfig();
  const url = new URL(`${config.navidromeUrl}/rest/${endpoint}`);
  url.searchParams.set('u', creds?.username || config.navidromeUsername || '');
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
  if (!username || !password) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome credentials incomplete');
  }

  const now = Date.now();
  if (token && now < tokenExpiry - TOKEN_REFRESH_THRESHOLD && subsonicToken && subsonicSalt) {
    return token;
  }

  const adaptiveTimeout = mobileOptimization.getAdaptiveTimeout();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), adaptiveTimeout);

  const authUrl = isBrowser()
    ? '/api/navidrome/auth/login'
    : `${config.navidromeUrl}/auth/login`;

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

    const salt = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const md5Token = md5Pure(password + salt);
    subsonicToken = md5Token;
    subsonicSalt = salt;

    tokenExpiry = now + 3600 * 1000;
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
                u: config.navidromeUsername || ndId,
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
