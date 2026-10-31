/**
 * Crates, audio loading and the analysis cache for the Transition Lab (#345). Browser-only.
 *
 * A crate is a Navidrome playlist (or Liked songs). Its tracks are analysed in the background
 * (fetch → decode at 11 kHz mono → analyseTrack) and cached in IndexedDB, so a crate is scanned once.
 */
import { analyseTrack, ANALYSIS_VERSION, V1_TRUSTED_BPM, dropLevelDb, fitOctave, meterName, type TrackAnalysis } from './analysis';
import { meanOf } from './dsp';
import { labBusy, labLog } from './log';

export interface LabSong {
  id: string;
  title: string;
  artist: string;
  album?: string;
  albumId?: string;
  duration: number;
  /** tagged tempo, if any */
  bpm?: number;
  genre?: string;
  /** every genre tag, primary first (OpenSubsonic) */
  genres?: string[];
  /** file size in bytes and format, from Navidrome (a FLAC is 25–60 MB) */
  size?: number;
  suffix?: string;
}

export interface CrateInfo {
  id: string;
  name: string;
  songCount: number;
}

interface SubsonicSong {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  albumId?: string;
  duration?: number;
  bpm?: number;
  genre?: string;
  genres?: { name: string }[];
  size?: number;
  suffix?: string;
  isDir?: boolean;
}

const toSong = (s: SubsonicSong): LabSong => ({
  id: s.id,
  title: s.title ?? 'Unknown',
  artist: s.artist ?? 'Unknown artist',
  album: s.album,
  albumId: s.albumId,
  duration: s.duration ?? 0,
  bpm: s.bpm || undefined,
  genre: s.genre,
  genres: s.genres?.map((g) => g.name).filter(Boolean),
  size: s.size,
  suffix: s.suffix,
});

/** Phones and tablets: iOS kills a page that runs out of memory, without any warning. */
export function isPhone(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

async function subsonic<T>(endpoint: string): Promise<T> {
  const res = await fetch(`/api/navidrome/rest/${endpoint}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`${endpoint}: ${res.status}`);
  const data = await res.json();
  return data['subsonic-response'] as T;
}

export const LIKED_CRATE = 'liked';

/**
 * Broad families for grouping picks: tags are fine-grained ("Deep Tech", "Boom Bap") or not genres at
 * all (YouTube's "Music", "People & Blogs"). A song's first tag that matches a family decides it.
 */
const GENRE_FAMILIES: [string, RegExp][] = [
  // Beatport's names too: "Indie Dance" and "Amapiano" are club music, "Mainstage" and "Hard Dance" festival EDM.
  ['House & techno', /house|techno|\btech\b|disco|garage|minimal|trance|electro(?!nic)|^dance$|indie dance|amapiano/],
  ['Bass & EDM', /dubstep|bass|drum|dnb|jungle|edm|hardstyle|riddim|breakbeat|breaks|mainstage|hard dance|\brave\b/],
  ['Hip hop', /hip[ -]?hop|rap\b|boom bap|drill|plugg|trap|grime|phonk/],
  ['Electronic', /electronic|synth|ambient|idm|downtempo|chill|lo-?fi/],
  ['Soul, funk & R&B', /soul|funk|r&b|rnb|boogie|jazz|blues|gospel/],
  ['Rock & indie', /rock|indie|punk|metal|shoegaze|grunge|emo\b|dark ?wave|new wave|cold ?wave/],
  ['Pop & Latin', /pop|latin|reggae|afro/],
  ['Folk & acoustic', /folk|country|acoustic|singer/],
];
export const OTHER_GENRE = 'Other';

export function genreFamily(song: LabSong): string {
  for (const tag of song.genres?.length ? song.genres : song.genre ? [song.genre] : []) {
    const t = tag.toLowerCase();
    const hit = GENRE_FAMILIES.find(([, re]) => re.test(t));
    if (hit) return hit[0];
  }
  return OTHER_GENRE;
}

/**
 * Longer than this is a DJ set or a show, not a track to mix: the Lab leaves it out. A 2-hour set is
 * a 200 MB download and gigabytes decoded; the phone killed the page each time the scan reached one.
 */
export const MAX_TRACK_SEC = 20 * 60;

export async function listCrates(): Promise<CrateInfo[]> {
  const r = await subsonic<{ playlists?: { playlist?: { id: string; name: string; songCount: number }[] } }>('getPlaylists');
  const lists = (r.playlists?.playlist ?? []).map((p) => ({ id: p.id, name: p.name, songCount: p.songCount }));
  return [{ id: LIKED_CRATE, name: 'Liked songs', songCount: 0 }, ...lists];
}

export async function loadCrate(id: string): Promise<LabSong[]> {
  if (id === LIKED_CRATE) {
    const r = await subsonic<{ starred2?: { song?: SubsonicSong[] } }>('getStarred2');
    return (r.starred2?.song ?? []).map(toSong);
  }
  const r = await subsonic<{ playlist?: { entry?: SubsonicSong[] } }>(`getPlaylist?id=${encodeURIComponent(id)}`);
  return (r.playlist?.entry ?? []).filter((s) => !s.isDir).map(toSong);
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const firstArtist = (a: string) => norm(a.split(/,|&| x | feat\.? | ft\.? /i)[0] ?? a);
const nameKey = (s: { artist: string; title: string }) => `${firstArtist(s.artist)}|${norm(s.title)}`;

/**
 * The songs of a saved set, for a replay: from the crate by id, or by artist and title when a retag
 * gave the file a new id; failing that from the library (a search, then the id). null where nothing
 * matches. A dead id still answers getSong, so it comes last: a song that won't stream is skipped.
 */
export async function findSongs(tracks: { id: string; title: string; artist: string }[], known: LabSong[]): Promise<(LabSong | null)[]> {
  const byId = new Map(known.map((s) => [s.id, s]));
  const byName = new Map(known.map((s) => [nameKey(s), s]));
  const out: (LabSong | null)[] = [];
  for (const t of tracks) {
    let song = byId.get(t.id) ?? byName.get(nameKey(t)) ?? null;
    if (!song) {
      const r = await subsonic<{ searchResult3?: { song?: SubsonicSong[] } }>(
        `search3?query=${encodeURIComponent(t.title)}&songCount=20&artistCount=0&albumCount=0`,
      ).catch(() => null);
      const hit = r?.searchResult3?.song?.map(toSong).find((s) => nameKey(s) === nameKey(t));
      song = hit ?? null;
    }
    if (!song) {
      const r = await subsonic<{ song?: SubsonicSong }>(`getSong?id=${encodeURIComponent(t.id)}`).catch(() => null);
      song = r?.song ? toSong(r.song) : null;
    }
    out.push(song);
  }
  return out;
}

/**
 * A whole file as an ArrayBuffer, by XHR and not fetch: a debug console that hooks fetch (Eruda's
 * Network panel, on whenever the app's debug mode is) reads every response body into a string and
 * keeps it for the page's lifetime: ~2 bytes per byte downloaded, a suspect in the sets that died
 * after 15–25 tracks. Eruda leaves arraybuffer XHRs alone.
 */
export function fetchAudio(id: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const aborted = () => new DOMException('Fetch is aborted', 'AbortError');
    if (signal?.aborted) return reject(aborted());
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const done = () => signal?.removeEventListener('abort', onAbort);
    xhr.open('GET', `/api/navidrome/stream/${encodeURIComponent(id)}`);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as ArrayBuffer);
      else reject(new Error(`stream ${xhr.status}`));
    };
    xhr.onerror = () => {
      done();
      reject(new TypeError('Load failed'));
    };
    xhr.onabort = () => {
      done();
      reject(aborted());
    };
    xhr.send();
  });
}

let decoder: OfflineAudioContext | null = null;
/** One context decodes every scanned song (Safari may hold on to each one it's given) */
function analysisDecoder(): OfflineAudioContext {
  if (!decoder) {
    try {
      decoder = new OfflineAudioContext(1, 1, 11025);
    } catch {
      decoder = new OfflineAudioContext(1, 1, 22050);
    }
  }
  return decoder;
}

/** Decode to mono at a low rate for analysis (11 kHz; 22 kHz where a browser refuses that). */
export async function decodeMono(buf: ArrayBuffer): Promise<{ mono: Float32Array; sr: number }> {
  const ab = await analysisDecoder().decodeAudioData(buf);
  const mono = new Float32Array(ab.length);
  for (let c = 0; c < ab.numberOfChannels; c++) {
    const ch = ab.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / ab.numberOfChannels;
  }
  return { mono, sr: ab.sampleRate };
}

/** Mono slice [t0, t1) s of a decoded buffer, at its own rate. */
export function monoSegment(buffer: AudioBuffer, t0: number, t1: number): { x: Float32Array; t0: number } {
  const a = Math.max(0, Math.floor(t0 * buffer.sampleRate));
  const b = Math.min(buffer.length, Math.ceil(t1 * buffer.sampleRate));
  const x = new Float32Array(Math.max(0, b - a));
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < x.length; i++) x[i] += ch[a + i] / buffer.numberOfChannels;
  }
  return { x, t0: a / buffer.sampleRate };
}

/* ---------- analysis cache (IndexedDB; every call fails soft, e.g. private mode) ---------- */

interface CacheEntry {
  analysis: TrackAnalysis;
  /** the tempo hint it was analysed under */
  hint?: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open('aidj-dj-lab', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('analysis');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function cacheGet(id: string, version = ANALYSIS_VERSION): Promise<CacheEntry | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = db.transaction('analysis').objectStore('analysis').get(`${id}:v${version}`);
      req.onsuccess = () => resolve(req.result as CacheEntry | undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

async function cachePut(id: string, entry: CacheEntry): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction('analysis', 'readwrite').objectStore('analysis').put(entry, `${id}:v${ANALYSIS_VERSION}`);
  } catch {
    // cache is a convenience
  }
}

/** A cached analysis is reused unless the tempo hint moved far enough to change the octave pick. */
const hintCompatible = (a?: number, b?: number) => !a || !b || Math.abs(Math.log2(a / b)) < 0.2;

export async function getCachedAnalysis(id: string, hint?: number): Promise<TrackAnalysis | null> {
  const hit = await cacheGet(id);
  if (hit && hintCompatible(hit.hint, hint)) return hit.analysis;
  // v1 read some half-time tracks at 2/3 or 1/2 tempo; keep only its readings that can't be that
  const old = await cacheGet(id, 1);
  return old && old.analysis.bpm >= V1_TRUSTED_BPM && hintCompatible(old.hint, hint) ? old.analysis : null;
}

/** Analysis for a song: cache, else from `buf` (or a fresh fetch). `buf` is left intact. */
export async function analyseSong(song: LabSong, hint: number | undefined, buf?: ArrayBuffer, signal?: AbortSignal): Promise<TrackAnalysis> {
  const cached = await getCachedAnalysis(song.id, hint);
  if (cached) return cached;
  const label = `${song.artist} – ${song.title}`;
  const from = buf ? 'lock' : 'scan';
  labLog('analysing', { song: label, from });
  const done = labBusy(`analyse ${label}`);
  const t0 = performance.now();
  try {
    const data = buf ? buf.slice(0) : await fetchAudio(song.id, signal);
    const fileMB = Math.round(data.byteLength / 1e5) / 10;
    const t1 = performance.now();
    const { mono, sr } = await decodeMono(data);
    const t2 = performance.now();
    // let the page breathe between decode and the ~0.3 s of analysis
    await new Promise((r) => setTimeout(r, 0));
    const analysis = analyseTrack(mono, sr, { bpmHint: hint ?? song.bpm });
    void cachePut(song.id, { analysis, hint: hint ?? song.bpm });
    labLog('analysed', { song: label, from, fileMB, fetchMs: Math.round(t1 - t0), decodeMs: Math.round(t2 - t1), bpm: analysis.bpm });
    return analysis;
  } catch (e) {
    const err = e as Error;
    labLog('analyse failed', { song: label, from, error: err.message, name: err.name }, err.name === 'AbortError' ? 'info' : 'warn');
    throw e;
  } finally {
    done();
  }
}

/* ---------- candidate ranking ---------- */

export interface Candidate {
  song: LabSong;
  /** counted at the octave closest to the set tempo (fitOctave): `meter` is set when that's half or double time */
  analysis: TrackAnalysis;
  /** stretch to the set tempo, % (negative = the track is faster than what's playing) */
  stretch: number;
  /** the track's own tempo minus the tempo playing now */
  bpmDelta: number;
  /** drop bass weight vs the playing track's, dB */
  bassDelta: number;
  score: number;
  reasons: string[];
  warnings: string[];
}

/** Low end of the entry drop relative to its loudness: "how hard it hits" once levels are matched. */
export function bassWeight(a: TrackAnalysis): number {
  return meanOf(a.el, a.de, a.de + 8) - dropLevelDb(a, a.de);
}

export const MAX_STRETCH = 0.08;

/**
 * Next-song candidates for the playing track, by the A/B rules: tempo within ±8 % (vinyl stretch),
 * a drop to chain into, energy up or level (never a weaker drop, rule 3), clean grid, new artist.
 */
export function rankCandidates(
  current: { song: LabSong; analysis: TrackAnalysis },
  pool: { song: LabSong; analysis: TrackAnalysis }[],
  opts: {
    setBpm: number;
    played: Set<string>;
    mode: 'dropchain' | 'classic';
    /** tempo window (#378): how much slower / faster the track may be than what's playing, % */
    window?: { down: number; up: number };
  },
): Candidate[] {
  const out: Candidate[] = [];
  const curBass = bassWeight(current.analysis);
  for (const { song, analysis: own } of pool) {
    if (song.id === current.song.id || opts.played.has(song.id)) continue;
    // a 172 BPM track can follow an 86 BPM one (and the reverse), counted at half / double time
    const analysis = fitOctave(own, opts.setBpm);
    const stretch = opts.setBpm / analysis.bpm - 1;
    if (Math.abs(stretch) > MAX_STRETCH) continue;
    const faster = (analysis.bpm / opts.setBpm - 1) * 100;
    if (opts.window && (faster > opts.window.up + 1e-9 || faster < -opts.window.down - 1e-9)) continue;
    const reasons: string[] = [];
    const warnings: string[] = [];
    if (analysis.meter) reasons.push(`${meterName(analysis)} · ${own.bpm.toFixed(0)} BPM`);
    if (opts.mode === 'dropchain' && analysis.drop === null) warnings.push('no clear drop');
    const dBass = bassWeight(analysis) - curBass;
    if (dBass < -3) warnings.push('lighter drop');
    if (analysis.gridConf < 0.2) warnings.push('loose beat grid');
    if (Math.abs(stretch) > 0.04) warnings.push('big stretch (pitch shifts)');
    const sameArtist = song.artist.toLowerCase() === current.song.artist.toLowerCase();
    if (sameArtist) warnings.push('same artist');
    const score =
      0.45 * (1 - Math.abs(stretch) / MAX_STRETCH) +
      0.25 * Math.min(1, Math.max(0, (dBass + 3) / 6)) +
      0.15 * Math.min(1, analysis.gridConf / 0.5) +
      0.15 * (sameArtist ? 0 : 1) -
      (opts.mode === 'dropchain' && analysis.drop === null ? 0.3 : 0) -
      // at the same tempo, a track at its own tempo first
      (analysis.meter ? 0.1 : 0);
    out.push({ song, analysis, stretch: stretch * 100, bpmDelta: analysis.bpm - opts.setBpm, bassDelta: dBass, score, reasons, warnings });
  }
  // closest tempo first (0.5 % steps), then the rest of the score
  const step = (c: Candidate) => Math.round(Math.abs(c.stretch) * 2);
  return out.sort((a, b) => step(a) - step(b) || b.score - a.score);
}
