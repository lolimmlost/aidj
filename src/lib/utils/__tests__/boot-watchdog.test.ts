import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOT_LOG_ENDPOINT, BOOT_SCRIPT, BOOT_STALL_MS } from '../boot-watchdog';

type BootWindow = Window & { __aidjPage?: { id: string; t0: number; started?: number; stalled?: number; errors: string[] } };
const w = window as BootWindow;

// run the script the way the page's <head> does (ScriptOnce appends this)
const runBootScript = () => new Function(`${BOOT_SCRIPT};`)();

async function beaconed(sendBeacon: ReturnType<typeof vi.fn>) {
  const [url, blob] = sendBeacon.mock.calls[0] as [string, Blob];
  return { url, body: JSON.parse(await blob.text()) as { entries: Array<Record<string, unknown>>; ua: string } };
}

describe('boot watchdog (#446)', () => {
  let sendBeacon: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    delete w.__aidjPage;
    sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon, onLine: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete w.__aidjPage;
  });

  it('names the page as soon as it runs', () => {
    runBootScript();
    expect(w.__aidjPage?.id).toMatch(/^[a-z0-9]{1,8}$/);
    expect(typeof w.__aidjPage?.t0).toBe('number');
  });

  it('reports an app that has not started after the wait, with the page id and what it saw', async () => {
    runBootScript();
    window.dispatchEvent(new ErrorEvent('error', { message: 'Unexpected token <' }));
    vi.advanceTimersByTime(BOOT_STALL_MS - 1);
    expect(sendBeacon).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const { url, body } = await beaconed(sendBeacon);
    expect(url).toBe(BOOT_LOG_ENDPOINT);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({
      sid: w.__aidjPage!.id,
      ev: 'app did not start',
      level: 'error',
      data: expect.objectContaining({ waitedSec: BOOT_STALL_MS / 1000, path: location.pathname, online: true, errors: ['Unexpected token <'] }),
    });
    // the app, if it starts later, sees that it was reported
    expect(w.__aidjPage!.stalled).toBeGreaterThan(0);
  });

  it('stays quiet when the app started in time', () => {
    runBootScript();
    w.__aidjPage!.started = Date.now();
    vi.advanceTimersByTime(BOOT_STALL_MS * 2);
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('runs once per page, even if the script runs again', () => {
    runBootScript();
    const id = w.__aidjPage!.id;
    runBootScript();
    expect(w.__aidjPage!.id).toBe(id);
    vi.advanceTimersByTime(BOOT_STALL_MS);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });
});
