/**
 * Differential validator for the canonical `"Artist - Title"` parser. READ-ONLY.
 *
 * Adopting `parseArtistTitle` in `media-flow-manager`'s duplicate gate changed a
 * comparison used for EQUALITY, not for display, so it genuinely changed which
 * songs that gate matches. Unit tests pin the shapes we thought of; this pins
 * the shapes the library actually contains.
 *
 * For every distinct `song_artist_title` in the database it computes the pair
 * the PRE-REFACTOR matcher compared against and the pair the current parser
 * produces, then classifies each divergence:
 *
 *   LOST   a query that used to match no longer does  → REGRESSION, exit 1
 *   GAINED a doubled row now matches its natural query → the point of the change
 *   MOVED  neither the old nor the new pair is reachable by the same query
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/validate-artist-title-corpus.ts
 *
 * Against prod, run it from a host that can reach the prod DB and point
 * DATABASE_URL at it. Nothing is mutated. Safe to run against production.
 *
 * Baseline: 2026-09-02, 691 distinct / 1,176 playlist_songs rows and 568
 * distinct / 597 recommendation_feedback rows → 0 LOST, 9 GAINED, 3 MOVED.
 */
import postgres from 'postgres';
import { parseArtistTitle } from '../src/lib/utils/song-artist-title';

type Pair = { artist: string; title: string } | null;

/**
 * The matcher as it stood before the refactor, reproduced verbatim from
 * `media-flow-manager.checkDuplicates`. Returns the pair it compared the
 * incoming query against, or null when it could never match.
 */
function legacyPair(songArtistTitle: string): Pair {
  const parts = songArtistTitle.split(' - ');
  if (parts.length >= 2) {
    return {
      artist: parts[0].toLowerCase().trim(),
      title: parts.slice(1).join(' - ').toLowerCase().trim(),
    };
  }
  return null;
}

/** The same question asked of the current parser, matching the refactored gate. */
function currentPair(songArtistTitle: string): Pair {
  const { artist, title } = parseArtistTitle(songArtistTitle);
  if (artist && title) {
    return { artist: artist.toLowerCase().trim(), title: title.toLowerCase().trim() };
  }
  return null;
}

const samePair = (a: Pair, b: Pair) =>
  (a === null && b === null) || (!!a && !!b && a.artist === b.artist && a.title === b.title);

const SOURCES: Array<{ table: string; column: string }> = [
  { table: 'playlist_songs', column: 'song_artist_title' },
  { table: 'recommendation_feedback', column: 'song_artist_title' },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Run with `npx tsx --env-file=.env`.');
    process.exit(2);
  }

  const sql = postgres(url, { max: 1 });
  let lostTotal = 0;

  try {
    for (const { table, column } of SOURCES) {
      const rows: Array<{ s: string; n: string }> = await sql.unsafe(
        `SELECT ${column} AS s, count(*)::text AS n
           FROM ${table}
          WHERE ${column} IS NOT NULL
          GROUP BY 1`
      );

      const totalRows = rows.reduce((a, r) => a + Number(r.n), 0);
      const lost: string[] = [];
      const gained: string[] = [];
      const moved: string[] = [];

      for (const row of rows) {
        const before = legacyPair(row.s);
        const after = currentPair(row.s);
        if (samePair(before, after)) continue;

        const line = `  ${JSON.stringify(row.s)} (x${row.n})\n` +
          `      was: ${before ? JSON.stringify(before) : 'unmatchable'}\n` +
          `      now: ${after ? JSON.stringify(after) : 'unmatchable'}`;

        if (after === null) {
          // The old matcher could be reached by some query; the new one cannot.
          lost.push(line);
        } else if (before !== null && before.title.startsWith(`${before.artist} - `)) {
          // A doubled row whose natural query the old matcher could never match.
          gained.push(line);
        } else {
          moved.push(line);
        }
      }

      console.log(
        `\n=== ${table}.${column}: ${rows.length} distinct / ${totalRows} rows ===\n` +
          `LOST ${lost.length}   GAINED ${gained.length}   MOVED ${moved.length}`
      );
      for (const [label, list] of [
        ['LOST (regression)', lost],
        ['GAINED', gained],
        ['MOVED', moved],
      ] as const) {
        if (!list.length) continue;
        console.log(`\n-- ${label}`);
        for (const l of list) console.log(l);
      }
      lostTotal += lost.length;
    }
  } finally {
    await sql.end();
  }

  if (lostTotal > 0) {
    console.error(
      `\nFAIL: ${lostTotal} stored string(s) matched under the old matcher and no longer match.`
    );
    process.exit(1);
  }
  console.log('\nOK: no stored string lost its matchability.');
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
