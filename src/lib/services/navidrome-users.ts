/**
 * Per-User Navidrome Account Service
 *
 * Creates and manages individual Navidrome accounts for each AIDJ user.
 * User-scoped operations (stars, playlists, scrobbles) use per-user credentials,
 * while shared operations (library browsing, search, streaming) use the admin account.
 *
 * Uses Navidrome's native REST API (POST /api/user) for user creation,
 * since the Subsonic `createUser` endpoint is not implemented in Navidrome.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { navidromeUsers } from '../db/schema';
import { getConfig } from '../config/config';
import { md5Pure, getAuthToken } from './navidrome';
import { ServiceError } from '../utils';

// ============================================================================
// Types
// ============================================================================

export interface SubsonicCreds {
  username: string;
  token: string;  // md5(password + salt)
  salt: string;
}

// ============================================================================
// In-memory cache for per-user creds
// ============================================================================

const credsCache = new Map<string, { creds: SubsonicCreds; expiresAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour TTL

function getCachedCreds(userId: string): SubsonicCreds | null {
  const entry = credsCache.get(userId);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.creds;
  }
  if (entry) {
    credsCache.delete(userId);
  }
  return null;
}

function setCachedCreds(userId: string, creds: SubsonicCreds): void {
  credsCache.set(userId, { creds, expiresAt: Date.now() + CACHE_TTL });
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Create a Navidrome account for an AIDJ user.
 * Uses Navidrome's native REST API (POST /api/user) with admin JWT auth.
 * The Subsonic `createUser` endpoint is not implemented in Navidrome.
 */
export async function createNavidromeUser(
  appUserId: string,
  displayName: string,
  email: string
): Promise<void> {
  const config = getConfig();
  if (!config.navidromeUrl) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
  }

  // Generate username: sanitize displayName + _aidj suffix
  let username = displayName
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 20);
  username = `${username}_aidj`;

  // Generate random password (32-char hex)
  const passwordBytes = new Uint8Array(16);
  crypto.getRandomValues(passwordBytes);
  const password = Array.from(passwordBytes, b => b.toString(16).padStart(2, '0')).join('');

  // Get admin JWT token for native API auth
  const adminToken = await getAuthToken();

  // Call Navidrome native REST API to create user
  const createUserUrl = `${config.navidromeUrl}/api/user`;

  let response: Response;
  try {
    response = await fetch(createUserUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nd-authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        userName: username,
        name: displayName,
        email: email || `${username}@aidj.local`,
        password: password,
        isAdmin: false,
      }),
    });
  } catch (error) {
    throw new ServiceError(
      'NAVIDROME_API_ERROR',
      `Failed to create Navidrome user: ${error instanceof Error ? error.message : 'Network error'}`
    );
  }

  // Handle username conflict (409 Conflict) — append random suffix and retry
  if (response.status === 409 || response.status === 422) {
    const suffix = Math.random().toString(36).substring(2, 6);
    username = `${username.substring(0, 16)}_${suffix}_aidj`;

    const retryResponse = await fetch(createUserUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nd-authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        userName: username,
        name: displayName,
        email: email || `${username}@aidj.local`,
        password: password,
        isAdmin: false,
      }),
    });

    if (!retryResponse.ok) {
      const retryBody = await retryResponse.text().catch(() => '');
      throw new ServiceError(
        'NAVIDROME_API_ERROR',
        `Failed to create Navidrome user (retry): ${retryResponse.status} ${retryBody}`
      );
    }
  } else if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ServiceError(
      'NAVIDROME_API_ERROR',
      `Navidrome createUser failed: ${response.status} ${body}`
    );
  }

  // Compute Subsonic token+salt for the new user
  const userSalt = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const userToken = md5Pure(password + userSalt);

  // Store in DB
  await db.insert(navidromeUsers).values({
    userId: appUserId,
    navidromeUsername: username,
    navidromePassword: password,
    navidromeSalt: userSalt,
    navidromeToken: userToken,
  });

  // Cache the creds
  setCachedCreds(appUserId, { username, token: userToken, salt: userSalt });

  console.log(`🎵 Created Navidrome account "${username}" for user ${appUserId}`);
}

/**
 * Get Navidrome credentials for a user.
 * Returns null if the user doesn't have a Navidrome account.
 */
export async function getNavidromeUserCreds(appUserId: string): Promise<SubsonicCreds | null> {
  // Check cache first
  const cached = getCachedCreds(appUserId);
  if (cached) return cached;

  // Query DB
  const record = await db
    .select()
    .from(navidromeUsers)
    .where(eq(navidromeUsers.userId, appUserId))
    .limit(1)
    .then(rows => rows[0]);

  if (!record) return null;

  const creds: SubsonicCreds = {
    username: record.navidromeUsername,
    token: record.navidromeToken,
    salt: record.navidromeSalt,
  };

  setCachedCreds(appUserId, creds);
  return creds;
}

/**
 * Ensure a Navidrome account exists for the user. Creates one if needed.
 * Idempotent — safe to call on every user-scoped operation.
 */
export async function ensureNavidromeUser(
  appUserId: string,
  name: string,
  email: string
): Promise<SubsonicCreds> {
  const existing = await getNavidromeUserCreds(appUserId);
  if (existing) return existing;

  // Create the account
  await createNavidromeUser(appUserId, name, email);

  // Fetch freshly created creds
  const creds = await getNavidromeUserCreds(appUserId);
  if (!creds) {
    throw new ServiceError(
      'NAVIDROME_USER_ERROR',
      'Failed to retrieve Navidrome credentials after creation'
    );
  }

  return creds;
}

/**
 * Build URLSearchParams for Subsonic API auth using per-user creds.
 */
export function buildSubsonicParams(creds: SubsonicCreds): URLSearchParams {
  return new URLSearchParams({
    u: creds.username,
    t: creds.token,
    s: creds.salt,
    v: '1.16.1',
    c: 'aidj',
    f: 'json',
  });
}
