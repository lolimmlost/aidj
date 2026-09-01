/**
 * Soft-delete marker for playlists removed on Navidrome.
 *
 * When a playlist is deleted on Navidrome, `syncNavidromePlaylists` soft-deletes
 * the local row: it nulls `navidromeId` AND prefixes `description` with this
 * marker (see playlist-sync.ts, step 4). The marker is the ONLY signal that
 * distinguishes a *deliberately deleted* playlist from one that was simply never
 * pushed to Navidrome — both end up with `navidromeId === null`.
 *
 * Anything that heals a local-only playlist forward to Navidrome MUST consult
 * this before (re)creating it, or it will resurrect a list the user intentionally
 * deleted — the fail-closed authoritative-remote-delete design from PR #175 (#160).
 */
export const DELETED_FROM_NAVIDROME_PREFIX = '[Deleted from Navidrome]';

const MARKER_RE = /^\[Deleted from Navidrome\]\s*/;

/** True if a playlist row's description carries the soft-delete marker. */
export function hasDeletedFromNavidromeMarker(
  description: string | null | undefined,
): boolean {
  return !!description && MARKER_RE.test(description);
}

/** Strip the "[Deleted from Navidrome] " prefix a prior soft delete may have added. */
export function stripDeletedMarker(description: string | null): string | null {
  if (!description) return description;
  const cleaned = description.replace(MARKER_RE, '');
  return cleaned.length > 0 ? cleaned : null;
}
