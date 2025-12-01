// Artist Recommendation Tracker for AI DJ
// Manages artist cooldown and recommendation frequency

// Track artist recommendation frequency across sessions
export interface ArtistRecommendationTracker {
  artist: string;
  lastRecommended: number;
  countToday: number;
  countThisSession: number;
  cooldownUntil: number; // Timestamp when cooldown expires
}

// In-memory tracker for artist recommendations
const artistRecommendationTracker = new Map<string, ArtistRecommendationTracker>();

// Cooldown duration constants (configurable for variety)
const ARTIST_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours cooldown (reduced from 8 for more variety)
const MAX_DAILY_RECOMMENDATIONS = 3; // Allow up to 3 recommendations per artist per day
const MAX_SESSION_RECOMMENDATIONS = 2; // Allow up to 2 per session before cooldown

/**
 * Check if artist has been recommended too frequently
 * @param artist - Artist name to check
 * @returns true if artist should be avoided for variety
 */
export function shouldAvoidArtist(artist: string): boolean {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const tracker = artistRecommendationTracker.get(artist);

  if (!tracker) {
    // First time seeing this artist - allow it and start tracking
    artistRecommendationTracker.set(artist, {
      artist,
      lastRecommended: now,
      countToday: 1,
      countThisSession: 1,
      cooldownUntil: now + ARTIST_COOLDOWN_MS,
    });
    return false;
  }

  // Check if artist is in cooldown period
  if (now < tracker.cooldownUntil) {
    console.log(`🎵 Artist "${artist}" is in cooldown until ${new Date(tracker.cooldownUntil).toLocaleTimeString()}`);
    return true;
  }

  // Check if it's a new day - reset daily count
  const isNewDay = now - tracker.lastRecommended > oneDayMs;
  const countToday = isNewDay ? 1 : tracker.countToday + 1;
  const countSession = tracker.countThisSession + 1;

  // Update tracking with new cooldown
  artistRecommendationTracker.set(artist, {
    artist,
    lastRecommended: now,
    countToday,
    countThisSession: countSession,
    cooldownUntil: now + ARTIST_COOLDOWN_MS,
  });

  // Balanced avoidance rules for variety:
  // - Allow up to MAX_DAILY_RECOMMENDATIONS per day
  // - Allow up to MAX_SESSION_RECOMMENDATIONS per session
  // After these limits, artist goes into cooldown

  return countToday > MAX_DAILY_RECOMMENDATIONS || countSession > MAX_SESSION_RECOMMENDATIONS;
}

/**
 * Get artists to avoid based on cooldown and frequency
 * @returns Set of artist names to avoid
 */
export function getArtistsToAvoid(): Set<string> {
  const artistsToAvoid = new Set<string>();
  
  for (const [artist, tracker] of artistRecommendationTracker.entries()) {
    if (shouldAvoidArtist(artist)) {
      artistsToAvoid.add(artist.toLowerCase());
      console.log(`🚫 Artist "${artist}" in cooldown (last: ${new Date(tracker.lastRecommended).toLocaleTimeString()}, today: ${tracker.countToday}, session: ${tracker.countThisSession})`);
    }
  }
  
  return artistsToAvoid;
}

/**
 * Get artist recommendation statistics
 * @returns Statistics about artist recommendations
 */
export function getArtistRecommendationStats() {
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  
  const recentArtists: string[] = [];
  const overRecommendedArtists: string[] = [];
  const cooledDownArtists: string[] = [];
  
  for (const [artist, tracker] of artistRecommendationTracker.entries()) {
    if (now - tracker.lastRecommended < oneDayAgo) {
      // Still within last day
      if (tracker.countToday > 0) {
        recentArtists.push(artist);
      }
    } else {
      // Older than a day, check if over-recommended
      if (tracker.countToday >= 2 || tracker.countThisSession >= 1) {
        overRecommendedArtists.push(artist);
      }
    }
    
    // Check cooldown status
    if (now >= tracker.cooldownUntil) {
      cooledDownArtists.push(artist);
    }
  }
  
  return {
    recentArtists,
    overRecommendedArtists,
    cooledDownArtists,
  };
}