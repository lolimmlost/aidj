// Artist Recommendation Tracker for AI DJ
// Manages artist cooldown and recommendation frequency

// Track artist recommendation frequency across sessions
export interface ArtistRecommendationTracker {
  artist: string;
  lastRecommended: number;
  countToday: number;
  countThisSession: number;
  cooldownUntil: number; // New field for artist cooldown
}

// In-memory tracker for artist recommendations
const artistRecommendationTracker = new Map<string, ArtistRecommendationTracker>();

/**
 * Check if artist has been recommended too frequently
 * @param artist - Artist name to check
 * @returns true if artist should be avoided for variety
 */
export function shouldAvoidArtist(artist: string): boolean {
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000); // 24 hours ago
  const eightHoursAgo = now - (8 * 60 * 60 * 1000); // Increased from 4 to 8 hours for cooldown
  const tracker = artistRecommendationTracker.get(artist);
  
  if (!tracker) {
    // First time seeing this artist
    artistRecommendationTracker.set(artist, {
      artist,
      lastRecommended: now,
      countToday: 1,
      countThisSession: 1,
      cooldownUntil: now + eightHoursAgo, // Set initial cooldown for 8 hours
    });
    return false;
  }
  
  // Check if artist is in cooldown period
  if (now < tracker.cooldownUntil) {
    console.log(`🎵 Artist "${artist}" is in cooldown until ${new Date(tracker.cooldownUntil).toLocaleTimeString()}`);
    return true;
  }
  
  // Update tracking
  const isNewDay = now > tracker.lastRecommended + oneDayAgo;
  const countToday = isNewDay ? 1 : tracker.countToday + 1;
  const countSession = tracker.countThisSession + 1;
  
  artistRecommendationTracker.set(artist, {
    artist,
    lastRecommended: now,
    countToday,
    countThisSession: countSession,
    cooldownUntil: now + eightHoursAgo, // Reset cooldown for 8 hours
  });
  
  // Much stricter avoidance rules:
  // - Recommended 1+ times today (reduced from 2)
  // - Recommended 1+ times in current session (same)
  // - Last recommended within last 8 hours (increased from 4)
  
  return countToday >= 1 || countSession >= 1;
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