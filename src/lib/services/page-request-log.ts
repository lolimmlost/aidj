/**
 * Page requests in the server log (#446).
 *
 * A launch that stays on a white screen leaves nothing in the app's own logs (2026-11-20: three
 * reopens of the iPhone PWA before one loaded, #443). Logging every HTML page request tells the
 * cases apart:
 *  - no `[PAGE]` line: the request never reached the server (the service worker or the network
 *    held it);
 *  - a line that ends "closed before finishing": the page was being sent when the browser gave up;
 *  - a normal line: the HTML arrived, so the page's own boot watchdog has the rest
 *    (`app did not start`, src/lib/utils/boot-watchdog.ts).
 *
 * Server only: used by server.ts. Assets, API calls and sockets are not logged.
 */
import type { IncomingMessage, ServerResponse } from 'http';

/** An HTML page load, not an asset, an API call or a socket. */
export function isPageRequest(req: Pick<IncomingMessage, 'method' | 'url' | 'headers'>): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const dest = req.headers['sec-fetch-dest'];
  if (typeof dest === 'string' && dest) return dest === 'document';
  // older browsers send no fetch metadata: go by the address and what the request accepts
  const path = (req.url ?? '').split('?')[0];
  if (path.startsWith('/api/') || path.startsWith('/ws/') || /\.[a-z0-9]{1,8}$/i.test(path)) return false;
  return String(req.headers.accept ?? '').includes('text/html');
}

// most specific first: Edge's and Opera's agents also name Chrome, Chrome's names Safari
const BROWSERS: Array<[RegExp, string]> = [
  [/Edg\/(\d+)/, 'Edge'],
  [/OPR\/(\d+)/, 'Opera'],
  [/Firefox\/(\d+)/, 'Firefox'],
  [/Chrome\/(\d+)/, 'Chrome'],
  [/Version\/(\d+)[^ ]* .*Safari\//, 'Safari'],
];

/** "iPhone iOS 18.7" / "Firefox 140 Linux": enough to tell the devices apart. */
export function shortUserAgent(ua: string | undefined): string {
  if (!ua) return '?';
  // the home-screen app and a Safari tab send the same agent: the page's own "page load" says which (pwa)
  const ios = ua.match(/(iPhone|iPad)[^)]*OS (\d+)_(\d+)/);
  if (ios) return `${ios[1]} iOS ${ios[2]}.${ios[3]}`;
  const os = ua.match(/Android \d+/)?.[0] ?? (/Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '');
  for (const [re, name] of BROWSERS) {
    const m = ua.match(re);
    if (m) return [`${name} ${m[1]}`, os].filter(Boolean).join(' ');
  }
  return [ua.slice(0, 40), os].filter(Boolean).join(' ');
}

/** Log one page request when it finishes, or when the browser drops it first. */
export function logPageRequest(
  req: IncomingMessage,
  res: ServerResponse,
  log: (line: string) => void = console.log,
  now: () => number = Date.now,
): void {
  if (!isPageRequest(req)) return;
  const t0 = now();
  const path = (req.url ?? '').split('?')[0].slice(0, 120).replace(/[^\x20-\x7e]/g, '?');
  const ua = shortUserAgent(req.headers['user-agent']);
  let finished = false;
  res.on('finish', () => {
    finished = true;
    log(`[PAGE] ${req.method} ${path} → ${res.statusCode} in ${now() - t0} ms (${ua})`);
  });
  res.on('close', () => {
    if (!finished) log(`[PAGE] ${req.method} ${path} closed before finishing, after ${now() - t0} ms (${ua})`);
  });
}
