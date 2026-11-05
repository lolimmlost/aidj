/**
 * Live-set recording (#391): the Lab's master output (after the compressor and soft clip, what the speakers get)
 * through a MediaRecorder, uploaded in ~10 s chunks as it goes, so a phone never holds the set (a 2-hour set at
 * 192 kbps is ~170 MB, and iOS kills a page that runs out of memory). Stopping sends the tracklist; the server
 * joins the chunks into one file next to it (routes/api/dj/lab-recording.ts).
 */
import { labLog } from './log';

const ENDPOINT = '/api/dj/lab-recording';
const SLICE_MS = 10_000;
const BITRATE = 192_000;
const RETRY_MS = 5000;
/** chunks still waiting past this many: the network is gone, say so (each is ~240 KB held in memory) */
const WARN_PENDING = 30;

export interface TrackStart {
  /** seconds into the recording */
  at: number;
  song: string;
}

export function recordingSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof AudioContext !== 'undefined' && 'createMediaStreamDestination' in AudioContext.prototype;
}

/** iOS Safari records AAC in mp4; Chrome and Firefox Opus in webm / ogg */
function pickMime(): string | undefined {
  for (const m of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SetRecorder {
  readonly id: string;
  readonly mime: string;
  /** ctx time the recording started: the tracklist is measured from here */
  readonly ctxStart: number;
  readonly startedAt = Date.now();
  private readonly rec: MediaRecorder;
  private readonly dest: MediaStreamAudioDestinationNode;
  private seq = 0;
  private queue: { seq: number; blob: Blob }[] = [];
  private uploading = false;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(
    ctx: AudioContext,
    private readonly source: AudioNode,
    private readonly onChange: () => void,
  ) {
    this.dest = ctx.createMediaStreamDestination();
    source.connect(this.dest);
    const mime = pickMime();
    this.rec = new MediaRecorder(this.dest.stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: BITRATE });
    this.mime = this.rec.mimeType || mime || '';
    this.id = `${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`;
    this.ctxStart = ctx.currentTime;
    this.rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      this.queue.push({ seq: this.seq++, blob: e.data });
      if (this.queue.length === WARN_PENDING) labLog('recording backlog', { id: this.id, pending: this.queue.length }, 'warn');
      void this.flush();
      this.onChange();
    };
    this.rec.start(SLICE_MS);
    labLog('recording start', { id: this.id, mime: this.mime });
  }

  get chunks() {
    return this.seq;
  }

  get pending() {
    return this.queue.length;
  }

  pause() {
    if (this.rec.state === 'recording') this.rec.pause();
  }

  resume() {
    if (this.rec.state === 'paused') this.rec.resume();
  }

  /** Upload waiting chunks in order; a network error waits and tries again, a refusal (4xx) drops the chunk. */
  private async flush() {
    if (this.uploading) return;
    this.uploading = true;
    try {
      while (this.queue.length) {
        const c = this.queue[0];
        let res: Response;
        try {
          res = await fetch(`${ENDPOINT}?id=${this.id}&seq=${c.seq}`, { method: 'POST', credentials: 'include', body: c.blob });
        } catch {
          break;
        }
        if (res.ok || (res.status >= 400 && res.status < 500)) {
          if (!res.ok) labLog('recording chunk refused', { id: this.id, seq: c.seq, status: res.status }, 'warn');
          this.queue.shift();
          this.onChange();
        } else break;
      }
    } finally {
      this.uploading = false;
    }
    if (this.queue.length && !this.retry) {
      this.retry = setTimeout(() => {
        this.retry = null;
        void this.flush();
      }, RETRY_MS);
    }
  }

  /** Stop, upload what's left (trying for about a minute), then have the server join the file. */
  async stop(tracklist: TrackStart[]): Promise<{ file?: string; error?: string }> {
    if (this.rec.state !== 'inactive') {
      // the last chunk arrives (ondataavailable) before onstop
      await new Promise<void>((r) => {
        this.rec.onstop = () => r();
        this.rec.stop();
      });
    }
    try {
      this.source.disconnect(this.dest);
    } catch {
      // already gone
    }
    for (let i = 0; i < 20 && (this.queue.length || this.uploading); i++) {
      await this.flush();
      if (this.queue.length || this.uploading) await sleep(3000);
    }
    if (this.queue.length) {
      labLog('recording incomplete', { id: this.id, unsent: this.queue.length }, 'error');
      return { error: `${this.queue.length} chunks never uploaded` };
    }
    try {
      const res = await fetch(`${ENDPOINT}?id=${this.id}&finish=1`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mime: this.mime, startedAt: new Date(this.startedAt).toISOString(), tracklist }),
      });
      if (!res.ok) return { error: `save failed (${res.status})` };
      const out = (await res.json()) as { file: string; chunks: number };
      labLog('recording saved', { id: this.id, file: out.file, chunks: out.chunks, songs: tracklist.length });
      return { file: out.file };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
}
