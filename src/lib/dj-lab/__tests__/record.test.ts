import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// a MediaRecorder that hands out a chunk whenever the test says so
class FakeRecorder {
  static last: FakeRecorder;
  static isTypeSupported = (m: string) => m === 'audio/mp4';
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType = 'audio/mp4';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    FakeRecorder.last = this;
  }
  start() {
    this.state = 'recording';
  }
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
  stop() {
    this.emit('last');
    this.state = 'inactive';
    this.onstop?.();
  }
  emit(text: string) {
    this.ondataavailable?.({ data: new Blob([text]) });
  }
}

const ctx = { currentTime: 12, createMediaStreamDestination: () => ({ stream: {} }) } as unknown as AudioContext;
const source = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;

describe('SetRecorder (#391)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('MediaRecorder', FakeRecorder);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uploads chunks in order as they come, retries after a network error, then saves with the tracklist', async () => {
    const calls: string[] = [];
    let offline = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (offline && !url.includes('finish')) throw new TypeError('Load failed');
        calls.push(url.includes('finish') ? `finish ${init.body}` : `${url.split('?')[1]} ${await (init.body as Blob).text()}`);
        return url.includes('finish') ? Response.json({ file: 'x.m4a', chunks: 3 }) : new Response(null, { status: 204 });
      }),
    );
    const { SetRecorder } = await import('../record');
    const rec = new SetRecorder(ctx, source, () => {});
    FakeRecorder.last.emit('a');
    FakeRecorder.last.emit('b');
    await vi.advanceTimersByTimeAsync(10);
    expect(rec.pending).toBe(2);
    offline = false;
    await vi.advanceTimersByTimeAsync(6000);
    expect(rec.pending).toBe(0);
    const done = rec.stop([{ at: 0, song: 'A – One' }]);
    // stop() waits between upload rounds
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await done).toEqual({ file: 'x.m4a' });
    expect(calls.slice(0, 3)).toEqual([`id=${rec.id}&seq=0 a`, `id=${rec.id}&seq=1 b`, `id=${rec.id}&seq=2 last`]);
    expect(JSON.parse(calls[3].slice('finish '.length))).toMatchObject({ mime: 'audio/mp4', tracklist: [{ at: 0, song: 'A – One' }] });
    expect(rec.ctxStart).toBe(12);
  });
});
