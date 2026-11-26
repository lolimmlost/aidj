/**
 * Known transitions from saved Lab sets (DJ tab "Set prep").
 *
 * A saved set (LAB_SETS_DIR/*.json, see /api/dj/lab-sets) lists its tracks in play order; each track
 * after the first carries the transition INTO it: kind + bars + cue bars (entryA = bar of the outgoing
 * song where it starts, cueB = bar of this song it lands on). Every consecutive pair is one observation.
 * Pure: the route reads the files, this folds them into one row per (from → to) pair.
 */
import type { KnownTechnique } from '@/lib/db/schema/known-transitions.schema';
import { canonicalNavidromeId } from '@/lib/utils/navidrome-id';

interface SetTrack {
  id?: unknown;
  title?: unknown;
  artist?: unknown;
  kind?: unknown;
  bars?: unknown;
  cues?: { entryA?: unknown; cueB?: unknown } | null;
}
export interface SavedLabSet {
  id?: unknown;
  startedAt?: unknown;
  updatedAt?: unknown;
  setBpm?: unknown;
  tracks?: unknown;
}

export interface PairAggregate {
  fromSongId: string;
  toSongId: string;
  fromTitle: string;
  fromArtist: string;
  toTitle: string;
  toArtist: string;
  plays: number;
  techniques: KnownTechnique[];
  setBpm: number | null;
  lastPlayedAt: Date | null;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const when = (s: SavedLabSet): Date | null => {
  for (const v of [s.updatedAt, s.startedAt]) {
    const d = typeof v === 'string' || typeof v === 'number' ? new Date(v) : null;
    if (d && !Number.isNaN(d.getTime())) return d;
  }
  return null;
};

/** Fold saved Lab sets into one aggregate per directed song pair, most played first. */
export function aggregateLabSets(sets: SavedLabSet[]): PairAggregate[] {
  type Acc = PairAggregate & { tech: Map<string, { kind: string; bars: number; count: number; cues: Map<string, number> }>; bpmAt: number };
  const pairs = new Map<string, Acc>();

  for (const set of sets) {
    if (!Array.isArray(set.tracks)) continue;
    const at = when(set);
    const bpm = num(set.setBpm);
    const tracks = set.tracks as SetTrack[];
    for (let i = 1; i < tracks.length; i++) {
      const a = tracks[i - 1];
      const b = tracks[i];
      const aId = str(a?.id);
      const bId = str(b?.id);
      if (!aId || !bId || aId === bId) continue;
      const from = canonicalNavidromeId(aId);
      const to = canonicalNavidromeId(bId);
      const key = `${from}>${to}`;
      let acc = pairs.get(key);
      if (!acc) {
        acc = {
          fromSongId: from, toSongId: to,
          fromTitle: str(a.title) || 'Unknown', fromArtist: str(a.artist),
          toTitle: str(b.title) || 'Unknown', toArtist: str(b.artist),
          plays: 0, techniques: [], setBpm: null, lastPlayedAt: null, tech: new Map(), bpmAt: -Infinity,
        };
        pairs.set(key, acc);
      }
      acc.plays += 1;
      const t = at?.getTime() ?? -Infinity;
      if (at && (!acc.lastPlayedAt || at > acc.lastPlayedAt)) acc.lastPlayedAt = at;
      // tempo of the most recent set that has this pair
      if (bpm != null && t >= acc.bpmAt) {
        acc.setBpm = bpm;
        acc.bpmAt = t;
      }
      const kind = str(b.kind);
      const bars = num(b.bars);
      if (kind && bars != null) {
        const tk = `${kind}:${bars}`;
        let tech = acc.tech.get(tk);
        if (!tech) acc.tech.set(tk, (tech = { kind, bars, count: 0, cues: new Map() }));
        tech.count += 1;
        const entryA = num(b.cues?.entryA);
        const cueB = num(b.cues?.cueB);
        if (entryA != null && cueB != null) {
          const ck = `${entryA}:${cueB}`;
          tech.cues.set(ck, (tech.cues.get(ck) ?? 0) + 1);
        }
      }
    }
  }

  return [...pairs.values()]
    .map(({ tech, bpmAt: _bpmAt, ...p }) => ({
      ...p,
      techniques: [...tech.values()]
        .sort((x, y) => y.count - x.count || x.bars - y.bars)
        .map((x) => {
          const top = [...x.cues.entries()].sort((m, n) => n[1] - m[1])[0]?.[0];
          const [entryA, cueB] = top ? top.split(':').map(Number) : [null, null];
          return { kind: x.kind, bars: x.bars, count: x.count, entryA, cueB };
        }),
    }))
    .sort((x, y) => y.plays - x.plays);
}
