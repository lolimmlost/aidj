import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type BootWindow = Window & { __aidjPage?: { id: string; t0: number; started?: number; stalled?: number } };
const w = window as BootWindow;

// each test gets a fresh module: a new page load
async function freshPage() {
  vi.resetModules();
  return import('../log');
}

const loads = (log: Awaited<ReturnType<typeof freshPage>>) => log.labLogEntries().filter((e) => e.ev === 'page load');

describe('page log on every page (#446)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    delete w.__aidjPage;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete w.__aidjPage;
  });

  it('takes the id the boot script gave the page, and logs how long the app took to start', async () => {
    w.__aidjPage = { id: 'boot01', t0: Date.now() - 1234 };
    const log = await freshPage();
    expect(log.labLogSid()).toBe('boot01');
    expect(log.pageId()).toBe('boot01');
    log.startPageLog();
    const [load] = loads(log);
    expect(load.sid).toBe('boot01');
    expect(load.data).toMatchObject({ path: location.pathname, visibility: 'visible', bootMs: 1234 });
    expect(load.data?.stallReported).toBeUndefined();
    // the boot watchdog now stays quiet
    expect(w.__aidjPage.started).toBeGreaterThan(0);
  });

  it('says so when the boot watchdog already reported the page as not started', async () => {
    w.__aidjPage = { id: 'slow01', t0: Date.now() - 14_000, stalled: Date.now() - 4000 };
    const log = await freshPage();
    log.startPageLog();
    expect(loads(log)[0].data).toMatchObject({ bootMs: 14_000, stallReported: true });
  });

  it('names its own id without the boot script', async () => {
    const log = await freshPage();
    expect(log.pageId()).toMatch(/^[a-z0-9]{1,6}$/);
    log.startPageLog();
    expect(loads(log)[0].data?.bootMs).toBeUndefined();
  });

  it('notes the previous page load in this storage, from any copy of the app', async () => {
    const a = await freshPage();
    a.startPageLog();
    vi.advanceTimersByTime(90_000);
    const b = await freshPage();
    b.startPageLog();
    expect(loads(b).at(-1)?.data).toMatchObject({ prevLoad: { sid: a.pageId(), agoSec: 90, path: location.pathname } });
  });

  it('logs the lifecycle on any page, not just the Lab, and once even if the Lab starts its log too', async () => {
    const log = await freshPage();
    log.startPageLog();
    log.startLabLog();
    log.startPageLog();
    expect(loads(log)).toHaveLength(1);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    const evs = log.labLogEntries().filter((e) => e.sid === log.pageId()).map((e) => e.ev);
    expect(evs).toContain('pageshow from bfcache');
  });
});
