import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Lock, Pause, Play, SkipForward } from 'lucide-react';
import { getCoverArtUrl } from '@/components/ui/album-art';
import { cn } from '@/lib/utils';
import { barTime, type TrackAnalysis } from '@/lib/dj-lab/analysis';
import { rankCandidates, type Candidate, type LabSong } from '@/lib/dj-lab/crate';
import { labLog } from '@/lib/dj-lab/log';
import type { Choices, EngineSnapshot, LabEngine } from '@/lib/dj-lab/engine';
import { fmtTime, useStarredIds, useTicker } from './useLab';

type Pool = { song: LabSong; analysis: TrackAnalysis }[];

const WAVE_BARS = 64;
const PICKS = 8;
/** timeline scale: px per second of track time (pinch or −/+ to zoom) */
const DEFAULT_PPS = 3.2;
const MIN_PPS = 1;
const MAX_PPS = 12;
const clampPps = (v: number) => Math.min(MAX_PPS, Math.max(MIN_PPS, v));
/** queued songs aren't planned yet: assume this much overlap per handover */
const QUEUE_BLEND_SEC = 30;

/**
 * MPC-style pads for the next transition, mapped onto the engine's choices
 * (same values as TransitionPicker). Style pads set the bass/filter handover;
 * bar pads set the blend length. A lit pad clears its keys (rules decide).
 */
type Pad = { label: string; sub: string; color: string; set: Partial<Choices>; keys: (keyof Choices)[] };
const STYLE_PADS: Pad[] = [
  { label: 'SWEEP', sub: 'FILTER FADE', color: '#9AD8F0', set: { bass: 'sweep' }, keys: ['bass', 'kill', 'depth'] },
  { label: 'SUB SWAP', sub: '2-BAR SUB CUT', color: '#C9BEFF', set: { bass: 'swap', depth: 'sub', kill: 2 }, keys: ['bass', 'kill', 'depth'] },
  { label: 'FULL CUT', sub: '<300 HZ · 2 BARS', color: '#E05F7E', set: { bass: 'swap', depth: 'full', kill: 2 }, keys: ['bass', 'kill', 'depth'] },
  { label: 'HPF RISE', sub: '90→500 HZ · 4', color: '#7CF2C4', set: { bass: 'swap', depth: 'rise', kill: 4 }, keys: ['bass', 'kill', 'depth'] },
];
const BAR_PADS: Pad[] = [
  { label: 'DROP STOP', sub: '½ BAR SILENCE', color: '#E0AE4A', set: { bass: 'swap', kill: 0.5, depth: 'sub' }, keys: ['bass', 'kill', 'depth'] },
  { label: '8 BARS', sub: 'SHORT BLEND', color: '#F4F3F8', set: { bars: 8 }, keys: ['bars'] },
  { label: '16 BARS', sub: 'BLEND', color: '#F4F3F8', set: { bars: 16 }, keys: ['bars'] },
  { label: '32 BARS', sub: 'LONG BLEND', color: '#F4F3F8', set: { bars: 32 }, keys: ['bars'] },
];
const padActive = (choices: Choices, pad: Pad) =>
  (Object.keys(pad.set) as (keyof Choices)[]).every((k) => choices[k] === pad.set[k]) &&
  pad.keys.every((k) => k in pad.set || choices[k] === undefined);

function Cover({ song, className }: { song: LabSong; className?: string }) {
  const url = song.albumId ? getCoverArtUrl(song.albumId, 160) : null;
  return url ? (
    <img src={url} alt="" loading="lazy" className={cn('shrink-0 bg-muted object-cover', className)} />
  ) : (
    <span className={cn('shrink-0 bg-gradient-to-br from-primary/40 to-primary/10', className)} />
  );
}

/** Per-bar loudness (dB) → WAVE_BARS heights 0..1, from the track's own analysis. */
function waveFromAnalysis(a: TrackAnalysis): number[] {
  const src = a.ef?.length ? a.ef : a.kw ?? [];
  if (!src.length) return Array.from({ length: WAVE_BARS }, () => 0.4);
  const out: number[] = [];
  for (let i = 0; i < WAVE_BARS; i++) {
    const from = Math.floor((i / WAVE_BARS) * src.length);
    const to = Math.max(from + 1, Math.floor(((i + 1) / WAVE_BARS) * src.length));
    let max = -Infinity;
    for (let j = from; j < to; j++) max = Math.max(max, src[j]);
    out.push(max);
  }
  const hi = Math.max(...out);
  const lo = Math.min(...out.filter(Number.isFinite));
  return out.map((v) => (Number.isFinite(v) && hi > lo ? 0.15 + 0.85 * ((v - lo) / (hi - lo)) : 0.15));
}

/** Tempo of each song in the set, oldest first: walk back from the set tempo, undoing jumps. */
function tempoSeries(snap: EngineSnapshot): number[] {
  const out: number[] = [];
  let bpm = snap.setBpm;
  for (let i = snap.history.length - 1; i >= 0; i--) {
    out.unshift(bpm);
    const jump = snap.history[i].plan?.jump;
    if (jump) bpm = jump.fromBpm;
  }
  return out.length ? out : [snap.setBpm];
}

function Sparkline({ values }: { values: number[] }) {
  const w = 70, h = 28;
  const lo = Math.min(...values) - 1, hi = Math.max(...values) + 1;
  const pts = values.map((v, i) => [values.length === 1 ? w : (i / (values.length - 1)) * w, h - 3 - ((v - lo) / (hi - lo)) * (h - 6)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="text-primary" />
      <circle cx={lx} cy={ly} r="2.6" className="fill-success" />
    </svg>
  );
}

/**
 * Glass UI (phones) Lab overview — canvas draft AD: live caption + BPM tracker,
 * the playing track with a waveform from its own per-bar loudness and the
 * mix-out point, the next transition as overlapping A/B lanes timed from the
 * engine's plan, and cover cards to lock what's next. LabMix stays below for
 * the full detail.
 */
export function GlassLabOverview({ engine, snap, pool, crateName }: { engine: LabEngine; snap: EngineSnapshot; pool: Pool; crateName?: string }) {
  useTicker(true, 250);
  const starred = useStarredIds();
  const now = snap.now;
  const next = snap.next;
  const played = useMemo(() => new Set([...snap.history.map((h) => h.song.id), ...snap.queue.map((q) => q.id)]), [snap.history, snap.queue]);
  const picks = useMemo(
    () =>
      now
        ? rankCandidates({ song: now.song, analysis: now.analysis }, pool, {
            setBpm: snap.setBpm,
            played,
            mode: snap.mode,
            window: { down: snap.defaults.tempoDown, up: snap.defaults.tempoUp },
            liked: starred,
          }).slice(0, PICKS)
        : [],
    [now, pool, snap.setBpm, played, snap.mode, snap.defaults.tempoDown, snap.defaults.tempoUp, starred],
  );
  const wave = useMemo(() => (now ? waveFromAnalysis(now.analysis) : []), [now]);
  const tempos = useMemo(() => tempoSeries(snap), [snap]);

  // Playheads move every frame (refs, not re-renders): the 250 ms ticker only
  // drives the text. The lanes window starts where you were when this song got
  // locked (or 45 s before the mix), so the line visibly travels to the blend.
  // pick cards: 1st tap selects, 2nd locks (or swaps), 3rd unlocks + clears
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The ranking can reshuffle under your finger (liked songs load late, the
  // queue changes): from your first tap the cards keep their order until you
  // clear the selection or the next song starts playing.
  const [frozenPicks, setFrozenPicks] = useState<Candidate[] | null>(null);
  const nowSongId = now?.song.id;
  useEffect(() => {
    setSelectedId(null);
    setFrozenPicks(null);
  }, [nowSongId]);
  const nowLineRef = useRef<HTMLSpanElement>(null);
  // BPM readouts pulse like a heartbeat: a thump on each bar's downbeat, a tick on the other beats
  const setBpmRef = useRef<HTMLSpanElement>(null);
  const nowBpmRef = useRef<HTMLSpanElement>(null);
  const playingRef = useRef(false);
  useEffect(() => {
    playingRef.current = snap.status === 'playing';
  }, [snap.status]);
  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const grid = now ? { bar0: now.analysis.bar0, barLen: now.analysis.barLen } : null;
  const laneHeadRef = useRef<HTMLDivElement>(null);
  const tlScrollRef = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(DEFAULT_PPS);
  const ppsRef = useRef(DEFAULT_PPS);
  useEffect(() => {
    ppsRef.current = pps;
  }, [pps]);
  // The strip follows the playhead until you scroll or pinch it; then it stays
  // where you put it until you tap NOW (or the next song starts).
  const [follow, setFollow] = useState(true);
  const followRef = useRef(true);
  useEffect(() => {
    followRef.current = follow;
  }, [follow]);
  // a new song playing: back to following the playhead
  useEffect(() => {
    setFollow(true);
  }, [nowSongId]);
  // the last scrollLeft the follow loop set: any other scroll position came from you
  const autoScrollAt = useRef<number | null>(null);
  // a zoom keeps one moment in place (under your fingers, or mid-view for −/+):
  // the scroll offset that does that is applied once the strip has its new width
  const pendingScroll = useRef<number | null>(null);
  useLayoutEffect(() => {
    const sc = tlScrollRef.current;
    if (sc && pendingScroll.current !== null) {
      sc.scrollLeft = Math.max(0, pendingScroll.current);
      autoScrollAt.current = null;
    }
    pendingScroll.current = null;
  }, [pps]);
  const plan0 = next?.plan;
  // Scrollable timeline in track-A seconds: A whole, B from where it comes in to
  // its end, then queued songs (not planned yet: dashed, assumed overlap).
  const timeline = useMemo(() => {
    if (!now) return null;
    const A = now.analysis;
    type Row = { key: string; song: LabSong; start: number; end: number; kind: 'now' | 'next' | 'queued' };
    const rows: Row[] = [];
    const aEnd = plan0 ? barTime(A, plan0.endA) : A.duration;
    rows.push({ key: 'A', song: now.song, start: 0, end: aEnd, kind: 'now' });
    let cursor = aEnd;
    let marks: { blend?: [number, number]; kill?: [number, number]; drop?: number } = {};
    if (next) {
      const mixStart = plan0 ? barTime(A, plan0.entryA) : Math.max(0, A.duration - 30);
      const cue = plan0 && next.analysis ? barTime(next.analysis, plan0.cueB) : 0;
      const len = (next.analysis?.duration ?? next.song.duration) - cue;
      rows.push({ key: 'B', song: next.song, start: mixStart, end: mixStart + Math.max(20, len), kind: 'next' });
      cursor = mixStart + Math.max(20, len);
      if (plan0) {
        marks = {
          blend: [mixStart, aEnd],
          kill: plan0.bass === 'swap' && plan0.kill > 0 ? [barTime(A, plan0.entryA + plan0.S - plan0.kill), barTime(A, plan0.entryA + plan0.S)] : undefined,
          drop: barTime(A, plan0.entryA + plan0.S),
        };
      }
    }
    for (const q of snap.queue.slice(0, 4)) {
      const start = Math.max(0, cursor - QUEUE_BLEND_SEC);
      rows.push({ key: `Q-${q.id}`, song: q, start, end: start + q.duration, kind: 'queued' });
      cursor = start + q.duration;
    }
    return { rows, marks, total: cursor + 10 };
  }, [now, next, plan0, snap.queue]);
  const dur0 = now ? Math.max(1, now.analysis.duration) : 1;
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const p = engine.position('now');
      if (p !== null && grid && grid.barLen > 0 && !reduceMotion) {
        const bars = (p - grid.bar0) / grid.barLen;
        const barPhase = ((bars % 1) + 1) % 1;
        const beat = Math.floor(barPhase * 4);
        const beatPhase = (barPhase * 4) % 1;
        const amp = !playingRef.current ? 0 : beat === 0 ? 0.18 : 0.06;
        const k = amp * Math.exp(-beatPhase * 7);
        for (const el of [setBpmRef.current, nowBpmRef.current]) {
          if (!el) continue;
          el.style.transform = `scale(${(1 + k).toFixed(3)})`;
          el.style.textShadow = beat === 0 && amp ? `0 0 ${Math.round(k * 80)}px currentColor` : 'none';
        }
      }
      if (p !== null) {
        if (nowLineRef.current) nowLineRef.current.style.left = `${Math.min(100, (p / dur0) * 100)}%`;
        if (laneHeadRef.current) laneHeadRef.current.style.left = `${p * ppsRef.current}px`;
        // follow the playhead (30 % in from the left) unless you've taken over
        const sc = tlScrollRef.current;
        if (sc && followRef.current) {
          const max = Math.max(0, sc.scrollWidth - sc.clientWidth);
          const want = Math.min(max, Math.max(0, p * ppsRef.current - sc.clientWidth * 0.3));
          if (Math.abs(sc.scrollLeft - want) > 1) {
            sc.scrollLeft = want;
            autoScrollAt.current = sc.scrollLeft;
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // grid is derived from now.analysis; re-run when the playing song changes
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  }, [engine, dur0, now?.analysis, reduceMotion]);

  const hasTimeline = !!(next && timeline);
  useEffect(() => {
    const sc = tlScrollRef.current;
    if (!sc || !hasTimeline) return;
    let pinch: { d0: number; pps0: number; anchorSec: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const focal = (t: TouchList) => (t[0].clientX + t[1].clientX) / 2 - sc.getBoundingClientRect().left;
    const takeOver = () => {
      if (followRef.current) {
        followRef.current = false;
        setFollow(false);
      }
    };
    const onScroll = () => {
      // ignore the scrolls the follow loop and zoom make
      if (autoScrollAt.current !== null && Math.abs(sc.scrollLeft - autoScrollAt.current) <= 2) return;
      if (pendingScroll.current !== null) return;
      if (followRef.current) takeOver();
    };
    // double tap: 2× around the tap (back to the default zoom when fully zoomed in)
    let tap: { x: number; y: number; moved: boolean } | null = null;
    let lastTap: { x: number; at: number } | null = null;
    const zoomAt = (x: number, nextPps: number) => {
      takeOver();
      pendingScroll.current = ((sc.scrollLeft + x) / ppsRef.current) * nextPps - x;
      ppsRef.current = nextPps;
      setPps(nextPps);
    };
    const onStart = (e: TouchEvent) => {
      tap = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false } : null;
      if (e.touches.length === 2) {
        takeOver();
        pinch = { d0: dist(e.touches), pps0: ppsRef.current, anchorSec: (sc.scrollLeft + focal(e.touches)) / ppsRef.current };
      }
    };
    const onMove = (e: TouchEvent) => {
      if (tap && e.touches.length === 1 && Math.hypot(e.touches[0].clientX - tap.x, e.touches[0].clientY - tap.y) > 10) tap.moved = true;
      if (e.touches.length !== 2 || !pinch) return;
      e.preventDefault(); // no native scroll or page zoom while pinching the strip
      const nextPps = clampPps(pinch.pps0 * (dist(e.touches) / pinch.d0));
      ppsRef.current = nextPps;
      // the moment you pinched on stays under your fingers' midpoint (which can also pan)
      pendingScroll.current = pinch.anchorSec * nextPps - focal(e.touches);
      setPps(nextPps);
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
      if (e.type !== 'touchend' || !tap || tap.moved || e.touches.length) {
        tap = null;
        return;
      }
      const x = tap.x - sc.getBoundingClientRect().left;
      const t = Date.now();
      if (lastTap && t - lastTap.at < 320 && Math.abs(tap.x - lastTap.x) < 40) {
        e.preventDefault();
        zoomAt(x, ppsRef.current >= MAX_PPS - 0.01 ? DEFAULT_PPS : clampPps(ppsRef.current * 2));
        lastTap = null;
      } else lastTap = { x: tap.x, at: t };
      tap = null;
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    sc.addEventListener('touchstart', onStart, { passive: true });
    sc.addEventListener('touchmove', onMove, { passive: false });
    sc.addEventListener('touchend', onEnd, { passive: false });
    sc.addEventListener('touchcancel', onEnd);
    return () => {
      sc.removeEventListener('scroll', onScroll);
      sc.removeEventListener('touchstart', onStart);
      sc.removeEventListener('touchmove', onMove);
      sc.removeEventListener('touchend', onEnd);
      sc.removeEventListener('touchcancel', onEnd);
    };
  }, [hasTimeline]);

  if (!now) return null;

  const playing = snap.status === 'playing';
  const interrupted = playing && !!snap.audio && snap.audio !== 'running';
  const pos = engine.position('now') ?? 0;
  const dur = Math.max(1, now.analysis.duration);
  const played01 = Math.min(1, pos / dur);
  const plan = next?.plan;
  const mixAt = plan ? barTime(now.analysis, plan.entryA) : null;
  const toBlend = engine.secondsToBlend();
  const frozen = next?.state === 'committed' || next?.state === 'mixing';
  const shortCountdown =
    next?.state === 'mixing' ? 'MIXING' : toBlend !== null && toBlend > 0 ? `MIX ${fmtTime(toBlend)}` : next?.state === 'loading' ? '…' : '—';

  const shownPicks = frozenPicks ?? picks;
  // Pads: 1st tap = this transition only, 2nd = lock (pin for the rest of the
  // set), 3rd = clear. One setChoices call = one re-plan (was one per key).
  const setKeys = (pad: Pad) => Object.keys(pad.set) as (keyof Choices)[];
  const padLocked = (pad: Pad) => padActive(snap.choices, pad) && setKeys(pad).every((k) => snap.pinned.includes(k));
  const applyPad = (pad: Pad) => {
    const on = padActive(snap.choices, pad);
    const locked = padLocked(pad);
    labLog('pad tap', { pad: pad.label, step: locked ? 'clear' : on ? 'lock' : 'on' });
    if (on && !locked) {
      for (const k of setKeys(pad)) if (!snap.pinned.includes(k)) engine.togglePin(k);
      return;
    }
    if (locked) for (const k of setKeys(pad)) if (snap.pinned.includes(k)) engine.togglePin(k);
    const patch: Partial<Record<keyof Choices, Choices[keyof Choices] | undefined>> = {};
    for (const k of pad.keys) patch[k] = on ? undefined : pad.set[k];
    engine.setChoices(patch as Parameters<LabEngine['setChoices']>[0]);
  };

  const zoomBy = (f: number) => {
    const sc = tlScrollRef.current;
    const nextPps = clampPps(ppsRef.current * f);
    // following: the loop re-centres on the playhead; otherwise keep mid-view in place
    if (sc && !followRef.current) pendingScroll.current = ((sc.scrollLeft + sc.clientWidth / 2) / ppsRef.current) * nextPps - sc.clientWidth / 2;
    ppsRef.current = nextPps;
    setPps(nextPps);
  };

  return (
    <div className="space-y-2.5">
      {/* Floating set-tempo pill (top right, stays while you scroll) */}
      <div
        className="glass-surface fixed right-3 top-[calc(env(safe-area-inset-top)+3.4rem)] z-30 flex items-center gap-2 rounded-full py-1 pl-2.5 pr-3 shadow-lg"
        role="status"
        aria-label={`Live set${crateName ? ` from ${crateName}` : ''}, ${snap.history.length} tracks, ${Math.round(snap.setBpm)} BPM`}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-success" />
        {/* one song in: no tempo line yet (it was an empty 70 px gap) */}
        {tempos.length > 1 && <Sparkline values={tempos} />}
        <span ref={setBpmRef} className="inline-block origin-center font-mono text-base font-bold will-change-transform">{Math.round(snap.setBpm)}</span>
        <span aria-hidden className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground">BPM</span>
      </div>

      <section className="glass-surface space-y-2 rounded-[20px] p-2.5" aria-label="Now playing">
        <div className="flex items-center gap-2.5">
          <Cover song={now.song} className="size-11 rounded-[10px] shadow-md" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-base font-bold leading-tight">{now.song.title}</div>
            <div className="truncate text-xs text-muted-foreground">{now.song.artist}</div>
          </div>
          <span
            ref={nowBpmRef}
            className="inline-block shrink-0 font-mono text-sm font-bold tabular-nums text-primary will-change-transform"
            aria-label={`${(now.analysis.bpm * now.rate).toFixed(1)} BPM`}
          >
            {(now.analysis.bpm * now.rate).toFixed(1)}
          </span>
          <button
            type="button"
            disabled={frozen}
            onClick={() => engine.skipAhead(6)}
            aria-label={plan ? 'Jump to 6 bars before the mix' : 'Jump 16 bars ahead'}
            className="grid size-9 shrink-0 place-items-center rounded-full text-foreground disabled:opacity-40"
          >
            <SkipForward className="size-4" />
          </button>
          <button
            type="button"
            aria-label={playing ? 'Pause' : 'Resume'}
            onClick={() => {
              if (playing) engine.pause();
              else {
                engine.unlockAudio();
                engine.resume();
              }
            }}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
          >
            {playing ? <Pause className="size-[18px] fill-current" /> : <Play className="ml-0.5 size-[18px] fill-current" />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 shrink-0 font-mono text-[10px] text-muted-foreground">{fmtTime(pos)}</span>
          <div className="relative flex h-7 flex-1 items-center gap-[2px]" aria-hidden>
            {wave.map((h, i) => (
              <span
                key={i}
                className={cn('flex-1 rounded-[1px]', i / wave.length <= played01 ? 'bg-primary' : 'bg-foreground/15')}
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            ))}
            {mixAt !== null && (
              <span className="absolute -inset-y-1 w-0.5 bg-success shadow-[0_0_8px_var(--success)]" style={{ left: `${(mixAt / dur) * 100}%` }} />
            )}
            <span ref={nowLineRef} className="absolute -inset-y-1 w-0.5 rounded bg-foreground shadow-[0_0_6px_var(--foreground)]" style={{ left: `${played01 * 100}%` }} />
          </div>
          <span className={cn('shrink-0 font-mono text-[10px]', frozen ? 'text-primary' : 'text-success')}>{shortCountdown}</span>
        </div>
        {interrupted && (
          <button type="button" onClick={() => engine.unlockAudio()} className="flex w-full items-center gap-1.5 rounded-lg bg-warning/10 px-2 py-1.5 text-left text-[11px] text-warning">
            <AlertTriangle className="size-3.5 shrink-0" /> The phone paused the audio (a call or another app). Tap to resume.
          </button>
        )}
      </section>

      <section className="glass-surface space-y-2.5 rounded-[20px] p-3" aria-label="Next transition">
        {next && timeline ? (
          <>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground">PINCH · DOUBLE-TAP · −/+</span>
              <span className="flex items-center gap-1">
                {!follow && (
                  <button
                    type="button"
                    onClick={() => setFollow(true)}
                    className="glass-flat flex h-7 items-center gap-1 rounded-full px-2.5 font-mono text-[10px] font-bold tracking-[0.08em]"
                    aria-label="Follow the playhead again"
                  >
                    <span aria-hidden className="size-1.5 rounded-full bg-foreground" /> NOW
                  </button>
                )}
                <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.5)} disabled={pps <= MIN_PPS} className="glass-flat grid size-7 place-items-center rounded-full font-mono text-sm disabled:opacity-40">−</button>
                <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.5)} disabled={pps >= MAX_PPS} className="glass-flat grid size-7 place-items-center rounded-full font-mono text-sm disabled:opacity-40">+</button>
              </span>
            </div>
            <div
              ref={tlScrollRef}
              className="-mx-3 touch-pan-x touch-pan-y overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Timeline: the playing track, the next one and anything queued. Scroll to see all of it."
            >
              <div className="relative" style={{ width: timeline.total * pps, height: 16 + timeline.rows.length * 40 }}>
                {Array.from({ length: Math.floor(timeline.total / 30) + 1 }, (_, i) => (
                  <span
                    key={`t${i}`}
                    aria-hidden
                    className="absolute top-0 font-mono text-[9px] text-muted-foreground/80"
                    style={{ left: i * 30 * pps }}
                  >
                    <span className="absolute left-0 top-3 h-1.5 w-px bg-foreground/25" />
                    {i % 2 === 0 ? fmtTime(i * 30) : ''}
                  </span>
                ))}
                {timeline.marks.blend && (
                  <div
                    aria-hidden
                    className="absolute bottom-0 top-4 rounded-md bg-[repeating-linear-gradient(135deg,color-mix(in_oklch,var(--foreground)_8%,transparent)_0_6px,transparent_6px_12px)]"
                    style={{ left: timeline.marks.blend[0] * pps, width: Math.max(0, timeline.marks.blend[1] - timeline.marks.blend[0]) * pps }}
                  />
                )}
                {timeline.rows.map((r, i) => (
                  <div
                    key={r.key}
                    className={cn(
                      // overflow-clip, not hidden: hidden would make the lane a scroll container and stop the sticky label
                      'absolute flex h-8 items-center overflow-clip rounded-[9px] border',
                      r.kind === 'now' && 'border-primary/45 bg-primary/15',
                      r.kind === 'next' && 'border-success/50 bg-success/15',
                      r.kind === 'queued' && 'border-dashed border-foreground/25 bg-foreground/5',
                    )}
                    style={{ top: 16 + i * 40, left: r.start * pps, width: Math.max(24, (r.end - r.start) * pps) }}
                  >
                    {/* stays at the strip's left edge while the lane scrolls past */}
                    <span className="sticky left-0 flex min-w-0 max-w-full items-center gap-1.5 px-1">
                      <Cover song={r.song} className="size-6 rounded-md" />
                      <span className="truncate text-[11px] font-semibold">
                        {r.kind === 'now' ? 'A' : r.kind === 'next' ? 'B' : 'Q'} · {r.song.title}
                      </span>
                    </span>
                  </div>
                ))}
                {timeline.marks.kill && (
                  <div
                    aria-hidden
                    title="Bass cut"
                    className="absolute top-4 h-8 rounded bg-destructive/35"
                    style={{ left: timeline.marks.kill[0] * pps, width: Math.max(3, (timeline.marks.kill[1] - timeline.marks.kill[0]) * pps) }}
                  />
                )}
                {timeline.marks.drop !== undefined && (
                  <div aria-hidden className="absolute bottom-0 top-3 w-px border-l border-dashed border-foreground/60" style={{ left: timeline.marks.drop * pps }}>
                    <span className="absolute -top-0.5 left-1 font-mono text-[8px] text-foreground/80">DROP</span>
                  </div>
                )}
                <div ref={laneHeadRef} aria-hidden className="absolute bottom-0 top-3 w-0.5 bg-foreground shadow-[0_0_8px_var(--foreground)]" style={{ left: pos * pps }} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* the timeline shows as soon as a song is locked; its plan arrives once it has loaded */}
              {plan ? (
                <span className="rounded-lg border border-foreground/15 px-2 py-1 font-mono text-[10px] text-foreground/80">
                  {plan.mode === 'dropchain' ? 'DROP-CHAIN' : 'CLASSIC'} · {plan.N} BARS · BASS {plan.bass.toUpperCase()}
                  {plan.jump ? ` · JUMP → ${Math.round(plan.jump.toBpm)}` : ''}
                </span>
              ) : (
                <span className="font-mono text-[10px] text-muted-foreground">PREPARING {next.song.title.toUpperCase()}…</span>
              )}
              <span className="font-mono text-[10px] tracking-[0.1em] text-success">{next.state.toUpperCase()}</span>
            </div>
          </>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">
            {next?.state === 'loading' ? `Preparing ${next.song.title}…` : next?.state === 'failed' ? `Can’t lock ${next.song.title}: pick another below.` : 'Nothing locked next: pick a card below.'}
          </p>
        )}
      </section>

      <section aria-labelledby="glass-lab-pads" className="space-y-2 pt-2.5">
        <div className="flex items-baseline justify-between">
          <h2 id="glass-lab-pads" className="font-display text-[17px] font-bold">Next transition</h2>
          <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">
            {frozen
              ? 'MIX COMMITTED'
              : snap.pinned.length
                ? 'LOCKED FOR THE SET'
                : Object.keys(snap.choices).length
                  ? 'NEXT ONLY · TAP AGAIN TO LOCK'
                  : 'AUTO · RULES DECIDE'}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[...STYLE_PADS, ...BAR_PADS].map((pad) => {
            const on = padActive(snap.choices, pad);
            const locked = on && padLocked(pad);
            return (
              <button
                key={pad.label}
                type="button"
                aria-pressed={on}
                aria-label={`${pad.label}: ${locked ? 'locked for the set, tap to clear' : on ? 'next transition only, tap to lock for the set' : 'tap for the next transition'}`}
                disabled={frozen}
                onClick={() => applyPad(pad)}
                className={cn(
                  'flex h-[68px] flex-col items-center justify-center gap-1 rounded-xl font-mono text-[10px] font-bold tracking-[0.06em] transition-transform active:translate-y-px disabled:opacity-40 [-webkit-tap-highlight-color:transparent]',
                  on ? 'text-[#0A090E]' : 'bg-gradient-to-b from-[#2B2838] to-[#1B1924] text-[#F4F3F8] shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_4px_8px_rgb(0_0_0/0.5)]',
                )}
                style={on ? { background: pad.color, boxShadow: locked ? `0 0 0 2px #F4F3F8, 0 0 24px ${pad.color}` : `0 0 20px ${pad.color}` } : undefined}
              >
                <span className="flex items-center gap-1">
                  {locked && <Lock className="size-3" aria-hidden />}
                  {pad.label}
                </span>
                <span className="text-[8px] font-medium opacity-75">{locked ? 'LOCKED · SET' : on ? 'NEXT · TAP=LOCK' : pad.sub}</span>
              </button>
            );
          })}
        </div>
      </section>

      {shownPicks.length > 0 && (
        <section aria-labelledby="glass-lab-picks" className="space-y-2 pt-2.5">
          <div className="flex items-baseline justify-between">
            <h2 id="glass-lab-picks" className="font-display text-[17px] font-bold">Pick what’s next</h2>
            <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">−{snap.defaults.tempoDown}…+{snap.defaults.tempoUp} %</span>
          </div>
          <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {shownPicks.map((c, idx) => {
              const isNext = next?.song.id === c.song.id;
              const isSel = !isNext && selectedId === c.song.id;
              const preparing = isNext && next?.state === 'loading';
              const near = Math.abs(c.bpmDelta) <= 0.02 * snap.setBpm;
              const swaps = !!next && next.state !== 'failed' && !isNext;
              const onTap = () => {
                const step = isNext ? 'unlock' : isSel ? 'lock' : 'select';
                labLog('card tap', { song: `${c.song.artist} – ${c.song.title}`, step, idx, next: next?.song.title, state: next?.state });
                if (isNext) {
                  engine.unlock();
                  setSelectedId(null);
                  setFrozenPicks(null);
                } else if (isSel) {
                  void engine.lock(c.song);
                } else {
                  setSelectedId(c.song.id);
                  if (!frozenPicks) setFrozenPicks(shownPicks);
                }
              };
              return (
                <button
                  key={c.song.id}
                  type="button"
                  disabled={frozen}
                  aria-pressed={isNext || isSel}
                  onClick={onTap}
                  aria-label={
                    isNext ? `${c.song.title} is locked next. Tap to unlock` : isSel ? `Tap again to ${swaps ? 'swap in' : 'lock'} ${c.song.title}` : `Select ${c.song.title}`
                  }
                  className={cn(
                    'glass-surface flex w-32 shrink-0 flex-col gap-2 rounded-[18px] p-2 text-left transition-[border-color,box-shadow] disabled:opacity-60 [-webkit-tap-highlight-color:transparent]',
                    isNext && 'border-success/70 shadow-[0_0_18px_color-mix(in_oklch,var(--success)_35%,transparent)]',
                    isSel && 'border-primary/80 shadow-[0_0_18px_color-mix(in_oklch,var(--primary)_40%,transparent)]',
                  )}
                >
                  <span className="relative block">
                    <Cover song={c.song} className="aspect-square w-full rounded-xl" />
                    {(isSel || isNext) && (
                      <span
                        className={cn(
                          'absolute inset-x-1 bottom-1 rounded-lg px-1.5 py-1 text-center text-[10px] font-semibold leading-tight backdrop-blur-md',
                          isNext ? 'bg-success/85 text-[#0A090E]' : 'bg-primary/85 text-primary-foreground',
                        )}
                      >
                        {isNext ? (preparing ? 'Preparing…' : 'Locked · tap to clear') : `Tap again to ${swaps ? 'swap' : 'lock'}`}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{c.song.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{c.song.artist}</span>
                  </span>
                  <span className="flex items-center justify-between font-mono text-[11px]">
                    <span className={near ? 'text-success' : 'text-muted-foreground'}>{c.analysis.bpm.toFixed(0)}</span>
                    <span className={cn('flex items-center gap-1', isNext ? 'text-success' : isSel ? 'text-primary' : 'text-muted-foreground')}>
                      {isNext ? (preparing ? 'PREPARING' : 'LOCKED') : isSel ? (swaps ? 'TAP: SWAP' : 'TAP: LOCK') : <><Lock className="size-3" /> SELECT</>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
