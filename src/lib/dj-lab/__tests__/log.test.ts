import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// each test gets a fresh module: the page-load id and "started" flag are per load
async function freshLog() {
  vi.resetModules();
  return import('../log');
}

describe('Lab flight recorder', () => {
  beforeEach(() => {
    // no flush timer outlives its test
    vi.useFakeTimers();
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps events across page loads', async () => {
    const a = await freshLog();
    a.labLog('loaded', { song: 'A – One', fileMB: 52.8 });
    const b = await freshLog();
    const entries = b.labLogEntries();
    expect(entries.map((e) => e.ev)).toEqual(['loaded']);
    expect(entries[0].sid).not.toBe(b.labLogSid());
    expect(b.formatEntry(entries[0])).toContain('song=A – One fileMB=52.8');
  });

  it('reports a page that died mid-set once, and not one that went away cleanly', async () => {
    const a = await freshLog();
    a.labBeat({ status: 'playing', song: 'A – One', pos: 200, heldMB: 290 });
    const b = await freshLog();
    b.startLabLog();
    const died = b.labLogEntries().filter((e) => e.ev === 'previous page died mid-set');
    expect(died).toHaveLength(1);
    expect(died[0].data).toMatchObject({ prevSid: a.labLogSid(), status: 'playing', song: 'A – One', heldMB: 290 });
    // the next load doesn't report it again
    const c = await freshLog();
    c.startLabLog();
    expect(c.labLogEntries().filter((e) => e.ev === 'previous page died mid-set')).toHaveLength(1);

    // a page that was reloaded on purpose (pagehide) isn't reported
    localStorage.clear();
    const d = await freshLog();
    d.startLabLog();
    d.labBeat({ status: 'playing', song: 'B – Two' });
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    const e = await freshLog();
    e.startLabLog();
    expect(e.labLogEntries().some((x) => x.ev === 'previous page died mid-set')).toBe(false);
  });

  it('names what was being decoded in the heartbeat', async () => {
    const a = await freshLog();
    const done = a.labBusy('analyse Dash Berlin – Janeiro');
    a.labBeat({ status: 'playing' });
    expect(JSON.parse(localStorage.getItem('aidj:dj-lab:beat')!).busy).toBe('analyse Dash Berlin – Janeiro');
    done();
    a.labBeat({ status: 'playing' });
    expect(JSON.parse(localStorage.getItem('aidj:dj-lab:beat')!).busy).toBeUndefined();
  });

  it('ships unsent events to the server and remembers what it sent', async () => {
    const a = await freshLog();
    a.labLog('lock', { song: 'A' });
    a.labLog('lock failed', { song: 'A' }, 'warn');
    await vi.advanceTimersByTimeAsync(10);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]!.body));
    expect(body.entries.map((e: { ev: string }) => e.ev)).toEqual(['lock', 'lock failed']);
    // nothing left to send
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('drops a batch the server refuses instead of retrying it forever', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Forbidden', { status: 403 })));
    const a = await freshLog();
    a.labLog('lock failed', { song: 'A' }, 'warn');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries after a server error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 502 })));
    const a = await freshLog();
    a.labLog('lock failed', { song: 'A' }, 'warn');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(1);
  });

  it("the pagehide beacon leaves a flush's batch to it (those lines used to land twice)", async () => {
    let answer: (r: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => (answer = r))));
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon });
    const a = await freshLog();
    a.startLabLog();
    a.labLog('mixing', { song: 'B' }, 'warn');
    // the flush is in flight with every event so far
    await vi.advanceTimersByTimeAsync(10);
    const sent = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body)).entries.map((e: { seq: number }) => e.seq);
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    // earlier tests' page loads still listen on this window: this load's beacon is the last one
    const beaconed = JSON.parse(await (sendBeacon.mock.calls.at(-1) as unknown as [string, Blob])[1].text()).entries.map((e: { seq: number }) => e.seq);
    expect(beaconed.some((s: number) => sent.includes(s))).toBe(false);
    // only what came after: the pagehide itself
    expect(beaconed).toHaveLength(1);
    answer(new Response(null, { status: 204 }));
  });
});
