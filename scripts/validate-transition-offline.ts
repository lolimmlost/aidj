/**
 * §9 Offline validation for transition learning. READ-ONLY — no writes.
 *
 * The gate before flipping the flag online (Step 6): does the mined transition
 * score actually predict a good follow better than chance? We do a time-based
 * holdout — build the graph from each user's OLDER history, then on the held-out
 * recent tail score every A→B adjacency and ask whether completed follows score
 * higher than skipped ones (rank AUC; 0.50 = chance).
 *
 * Reuses the SHIPPED scoring functions from transition-scoring.ts (not a
 * reimplementation) so this validates exactly what production would do.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/validate-transition-offline.ts [email] [--holdout=0.2]
 *
 * With no email, reports per-user across everyone with enough data. Nothing is
 * mutated; safe against production. Decay is anchored at the holdout cutoff so
 * training never peeks at the future.
 */
import postgres from 'postgres';
import {
  splitIntoSessions,
  accumulateTransitions,
  scoreAgainstEdges,
  RECOMMENDER_ORIGINS,
  type PlayRow,
  type TransitionEdge,
  __internal,
} from '../src/lib/services/transition-scoring';

// Mirror the transitionLearning feature-flag defaults (features.ts).
// minSupport is overridable via --min-support=N to probe the coverage/precision gate.
const DEFAULT_MIN_SUPPORT = 3;
const HALF_LIFE_DAYS = 120;
const DEFAULT_HOLDOUT = 0.2; // most-recent 20% of plays (by time) become the test set
const MIN_TEST_PAIRS = 20;   // below this the AUC is noise; skip the user

type Row = {
  user_id: string;
  email: string | null;
  song_id: string;
  artist: string | null;
  genre: string | null;
  played_at: Date;
  completed: number | null;
  skip_detected: number | null;
  source: string | null;
};

function toPlay(r: Row): PlayRow {
  return {
    songId: r.song_id ?? '',
    artist: __internal.normArtist(r.artist),
    genre: __internal.normGenre(r.genre),
    playedAt: r.played_at,
    completed: r.completed === 1,
    skipped: r.skip_detected === 1,
    isRecommender: !!r.source && RECOMMENDER_ORIGINS.has(r.source),
  };
}

/** Average-rank AUC = P(score(positive) > score(negative)), ties counted as 0.5. */
function auc(items: Array<{ score: number; label: 0 | 1 }>): number | null {
  const nP = items.filter((i) => i.label === 1).length;
  const nN = items.length - nP;
  if (!nP || !nN) return null;
  const sorted = items.slice().sort((a, b) => a.score - b.score);
  let rankSumPos = 0;
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j < sorted.length && sorted[j].score === sorted[i].score) j++;
    const avgRank = (i + 1 + j) / 2; // average of 1-based ranks i+1..j
    for (let k = i; k < j; k++) if (sorted[k].label === 1) rankSumPos += avgRank;
    i = j;
  }
  return (rankSumPos - (nP * (nP + 1)) / 2) / (nP * nN);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

interface Report {
  email: string;
  trainPlays: number;
  testPairs: number;
  positives: number;
  negatives: number;
  aucAll: number | null;
  firedFrac: number;      // fraction of test pairs where the signal was non-neutral
  aucFired: number | null; // AUC restricted to pairs where the signal actually spoke
  meanPos: number;
  meanNeg: number;
}

/** Build the graph from train, score every labeled test adjacency, summarize. */
function evaluateUser(email: string, plays: PlayRow[], holdout: number, minSupport: number): Report | null {
  if (plays.length < 50) return null;

  // Time cutoff at the (1 - holdout) quantile; plays are already time-ordered.
  const cutoffIdx = Math.floor(plays.length * (1 - holdout));
  const cutoff = plays[cutoffIdx].playedAt;
  const train = plays.filter((p) => p.playedAt < cutoff);
  const test = plays.filter((p) => p.playedAt >= cutoff);
  if (train.length < 20 || test.length < 10) return null;

  // Graph from train only; decay anchored at cutoff so we never score with hindsight.
  const edgeMap = accumulateTransitions(splitIntoSessions(train), {
    halfLifeDays: HALF_LIFE_DAYS,
    now: cutoff,
  });
  const edges: TransitionEdge[] = [...edgeMap.values()];

  const scored: Array<{ score: number; label: 0 | 1; fired: boolean }> = [];
  let pairId = 0;
  for (const session of splitIntoSessions(test)) {
    for (let i = 0; i + 1 < session.length; i++) {
      const a = session[i];
      const b = session[i + 1];
      // Only pairs with a definitive outcome on B are labeled.
      const label: 0 | 1 | null = b.skipped ? 0 : b.completed ? 1 : null;
      if (label === null) continue;

      const id = `p${pairId++}`;
      const m = scoreAgainstEdges(
        a.artist,
        a.genre,
        [{ id, artist: b.artist, genre: b.genre }],
        edges,
        minSupport,
      );
      const score = m.get(id) ?? 0.5;
      scored.push({ score, label, fired: score !== 0.5 });
    }
  }

  if (scored.length < MIN_TEST_PAIRS) return null;

  const positives = scored.filter((s) => s.label === 1);
  const negatives = scored.filter((s) => s.label === 0);
  const fired = scored.filter((s) => s.fired);

  return {
    email,
    trainPlays: train.length,
    testPairs: scored.length,
    positives: positives.length,
    negatives: negatives.length,
    aucAll: auc(scored),
    firedFrac: fired.length / scored.length,
    aucFired: auc(fired),
    meanPos: mean(positives.map((s) => s.score)),
    meanNeg: mean(negatives.map((s) => s.score)),
  };
}

function fmt(n: number | null, dp = 3): string {
  return n === null || Number.isNaN(n) ? '  —  ' : n.toFixed(dp);
}

async function main() {
  const email = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const holdoutArg = process.argv.find((a) => a.startsWith('--holdout='));
  const holdout = holdoutArg ? Number(holdoutArg.split('=')[1]) : DEFAULT_HOLDOUT;
  if (!(holdout > 0 && holdout < 0.9)) {
    console.error(`--holdout must be in (0, 0.9), got ${holdout}`);
    process.exit(1);
  }
  const msArg = process.argv.find((a) => a.startsWith('--min-support='));
  const minSupport = msArg ? Number(msArg.split('=')[1]) : DEFAULT_MIN_SUPPORT;
  if (!Number.isInteger(minSupport) || minSupport < 1) {
    console.error(`--min-support must be an integer >= 1, got ${minSupport}`);
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL!);
  try {
    let userId: string | undefined;
    if (email) {
      const u = await sql`SELECT id FROM "user" WHERE email = ${email} LIMIT 1`;
      if (u.length === 0) {
        console.error(`No user with email ${email}`);
        process.exit(1);
      }
      userId = u[0].id as string;
    }

    const rows = userId
      ? await sql<Row[]>`
          SELECT lh.user_id, u.email, lh.song_id, lh.artist, lh.genre, lh.played_at,
                 lh.completed, lh.skip_detected, lh.source
          FROM listening_history lh JOIN "user" u ON u.id = lh.user_id
          WHERE lh.user_id = ${userId}
          ORDER BY lh.played_at ASC, lh.id ASC`
      : await sql<Row[]>`
          SELECT lh.user_id, u.email, lh.song_id, lh.artist, lh.genre, lh.played_at,
                 lh.completed, lh.skip_detected, lh.source
          FROM listening_history lh JOIN "user" u ON u.id = lh.user_id
          ORDER BY lh.user_id, lh.played_at ASC, lh.id ASC`;

    // Group by user, keeping the artist-present filter computeForUser applies.
    const byUser = new Map<string, { email: string; plays: PlayRow[] }>();
    for (const r of rows) {
      if (!r.artist || !r.artist.trim()) continue;
      const entry = byUser.get(r.user_id) ?? { email: r.email ?? r.user_id, plays: [] };
      entry.plays.push(toPlay(r));
      byUser.set(r.user_id, entry);
    }

    console.log(`\nOffline transition validation  (holdout=${holdout}, minSupport=${minSupport}, halfLife=${HALF_LIFE_DAYS}d)`);
    console.log('AUC 0.50 = chance. "fired" = share of test pairs where the signal was non-neutral.\n');
    console.log(
      'user'.padEnd(28),
      'train'.padStart(7),
      'pairs'.padStart(7),
      'pos'.padStart(6),
      'neg'.padStart(6),
      'AUC'.padStart(7),
      'fired'.padStart(7),
      'AUC|fired'.padStart(10),
      'μpos'.padStart(7),
      'μneg'.padStart(7),
    );

    const reports: Report[] = [];
    for (const { email: e, plays } of byUser.values()) {
      const rep = evaluateUser(e, plays, holdout, minSupport);
      if (rep) reports.push(rep);
    }
    reports.sort((a, b) => (b.aucAll ?? 0) - (a.aucAll ?? 0));

    for (const r of reports) {
      console.log(
        r.email.slice(0, 28).padEnd(28),
        String(r.trainPlays).padStart(7),
        String(r.testPairs).padStart(7),
        String(r.positives).padStart(6),
        String(r.negatives).padStart(6),
        fmt(r.aucAll).padStart(7),
        `${(r.firedFrac * 100).toFixed(0)}%`.padStart(7),
        fmt(r.aucFired).padStart(10),
        fmt(r.meanPos, 2).padStart(7),
        fmt(r.meanNeg, 2).padStart(7),
      );
    }

    if (reports.length === 0) {
      console.log('  (no users had enough held-out labeled adjacency to evaluate)');
    } else {
      console.log(
        `\nInterpretation: AUC>0.55 with a non-trivial "fired" share = the signal has predictive value` +
        `\nand is worth the online A/B (Step 6). AUC≈0.50 or fired≈0% = it would be inert/cosmetic — do not ship.`,
      );
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
