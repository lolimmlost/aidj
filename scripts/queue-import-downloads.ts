/**
 * Queue an import's missing songs for download via Lidarr — the manual version of the
 * import dialog's "Download missing" button.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/queue-import-downloads.ts <importJobId> [--include-review] [--dry-run]
 *
 * Songs come from the import job's saved match results: `no_match` always, plus
 * `pending_review` with --include-review. Uses the same helper as /api/downloads/queue
 * (monitors the artist + only the album containing the song, then AlbumSearch).
 * Needs LIDARR_URL and LIDARR_API_KEY. --dry-run lists the songs and writes nothing.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { playlistImportJobs } from '@/lib/db/schema/playlist-export.schema';
import { queueToLidarr } from '@/lib/services/lidarr-downloader';

async function main() {
  const args = process.argv.slice(2);
  const importJobId = args.find((a) => !a.startsWith('--'));
  const includeReview = args.includes('--include-review');
  const dryRun = args.includes('--dry-run');
  if (!importJobId) {
    console.error('Usage: scripts/queue-import-downloads.ts <importJobId> [--include-review] [--dry-run]');
    process.exit(1);
  }

  const [job] = await db.select().from(playlistImportJobs).where(eq(playlistImportJobs.id, importJobId));
  if (!job) {
    console.error(`Import job ${importJobId} not found`);
    process.exit(1);
  }

  const wanted = new Set(includeReview ? ['no_match', 'pending_review'] : ['no_match']);
  const songs = (job.matchResults ?? [])
    .filter((r) => wanted.has(r.status))
    .map((r) => ({ title: r.originalSong.title, artist: r.originalSong.artist, album: r.originalSong.album }));

  console.log(`Job "${job.playlistName}": ${songs.length} songs to queue (${[...wanted].join(' + ')})`);
  if (dryRun) {
    for (const s of songs) console.log(`  ${s.artist} - ${s.title}${s.album ? ` [${s.album}]` : ''}`);
    return;
  }

  const result = await queueToLidarr(songs);
  console.log(`Queued ${result.queued}, failed ${result.failed}`);
  for (const e of result.errors.slice(0, 20)) console.log(`  ! ${e}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
