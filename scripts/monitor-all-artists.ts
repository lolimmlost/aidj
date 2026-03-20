/**
 * Retroactively set all unmonitored artists in Lidarr to monitored.
 * Usage: npx tsx --env-file=.env scripts/monitor-all-artists.ts
 */

const LIDARR_URL = process.env.LIDARR_URL || "http://10.0.0.30:8686";
const LIDARR_API_KEY = process.env.LIDARR_API_KEY;

if (!LIDARR_API_KEY) {
  console.error("LIDARR_API_KEY is not set. Check your .env file.");
  process.exit(1);
}

const headers = {
  "X-Api-Key": LIDARR_API_KEY,
  "Content-Type": "application/json",
};

async function main() {
  // Get all artists
  const res = await fetch(`${LIDARR_URL}/api/v1/artist`, { headers });
  if (!res.ok) {
    console.error("Failed to fetch artists:", res.statusText);
    process.exit(1);
  }

  const artists = await res.json();
  const unmonitored = artists.filter((a: { monitored: boolean }) => !a.monitored);

  console.log(`Total artists: ${artists.length}`);
  console.log(`Unmonitored: ${unmonitored.length}`);

  if (unmonitored.length === 0) {
    console.log("All artists are already monitored!");
    return;
  }

  console.log(`\nSetting ${unmonitored.length} artists to monitored...\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < unmonitored.length; i++) {
    const artist = unmonitored[i];
    try {
      const putRes = await fetch(`${LIDARR_URL}/api/v1/artist/${artist.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ ...artist, monitored: true }),
      });

      if (putRes.ok) {
        success++;
      } else {
        console.error(`  FAILED: ${artist.artistName} (${putRes.statusText})`);
        failed++;
      }
    } catch (err) {
      console.error(`  ERROR: ${artist.artistName}:`, err instanceof Error ? err.message : err);
      failed++;
    }

    // Progress every 50
    if ((i + 1) % 50 === 0) {
      console.log(`  [${i + 1}/${unmonitored.length}] processed...`);
    }

    // Small delay to avoid hammering the API
    if (i < unmonitored.length - 1) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  console.log(`\nDone. ${success} monitored, ${failed} failed.`);
}

main();
