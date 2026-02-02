/**
 * Profile Update API Endpoint
 *
 * Triggers a full user profile recalculation for AI DJ recommendations.
 * This includes:
 * - Syncing liked songs to feedback table
 * - Calculating compound scores from listening history
 * - Calculating artist affinities
 * - Calculating temporal preferences
 *
 * Should be called:
 * - On app startup (if profile data is stale)
 * - After significant listening activity (10+ plays)
 * - Via user-triggered refresh
 */

import { createFileRoute } from "@tanstack/react-router";
import { auth } from '@/lib/auth/auth';
import { calculateFullUserProfile } from '@/lib/services/compound-scoring';

export async function POST({ request }: { request: Request }) {
  try {
    // Verify authentication
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userId = session.user.id;
    console.log(`👤 [ProfileAPI] Profile update requested for user ${userId}`);

    // Parse optional parameters from request body
    let daysBack = 14; // Default lookback
    try {
      const body = await request.json();
      if (body.daysBack && typeof body.daysBack === 'number') {
        daysBack = Math.min(Math.max(body.daysBack, 7), 90); // Clamp between 7-90 days
      }
    } catch {
      // No body or invalid JSON - use defaults
    }

    // Calculate full user profile
    const result = await calculateFullUserProfile(userId, daysBack);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Profile updated successfully',
        data: {
          compoundScores: result.compoundScores,
          artistAffinities: result.artistAffinities,
          temporalPreferences: result.temporalPreferences,
          likedSongsSynced: result.likedSongsSync.synced,
          likedSongsUnstarred: result.likedSongsSync.unstarred,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('👤 [ProfileAPI] Error updating profile:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to update profile',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function GET({ request }: { request: Request }) {
  try {
    // Verify authentication
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userId = session.user.id;

    // Import services dynamically to avoid circular dependencies
    const { getTopArtistsByAffinity, getPreferredGenresForNow } = await import('@/lib/services/artist-affinity');
    const { getLikedSongsCount } = await import('@/lib/services/liked-songs-sync');
    const { hasProfileData } = await import('@/lib/services/profile-recommendations');

    // Get profile summary
    const [topArtists, preferredGenres, likedCount, hasProfile] = await Promise.all([
      getTopArtistsByAffinity(userId, 10),
      getPreferredGenresForNow(userId, 5),
      getLikedSongsCount(userId),
      hasProfileData(userId),
    ]);

    return new Response(
      JSON.stringify({
        hasProfile,
        likedSongsCount: likedCount,
        topArtists: topArtists.map(a => ({
          artist: a.artist,
          score: Math.round(a.affinityScore * 100) / 100,
          playCount: a.playCount,
          likedCount: a.likedCount,
        })),
        preferredGenresNow: preferredGenres.map(g => ({
          genre: g.genre,
          score: Math.round(g.preferenceScore * 100) / 100,
          playCount: g.playCount,
        })),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('👤 [ProfileAPI] Error getting profile:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to get profile',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export const Route = createFileRoute("/api/profile/update")({
  server: {
    handlers: {
      POST,
      GET,
    },
  },
});
