import type { UserQueued } from '@/lib/stores/audio';

/** Where a queue entry came from, shown as a tag and a coloured edge on its row. */
export type QueueSource = 'you' | 'ai' | 'autoplay' | 'radio';

export interface QueueSourceInfo {
  source: QueueSource;
  label: string;
  /** CSS colour for the tag text, edge and tint. */
  color: string;
}

const COLOR: Record<QueueSource, string> = {
  you: 'var(--aidj-amber)',
  ai: 'var(--aidj-violet)',
  autoplay: 'var(--aidj-cyan)',
  radio: 'var(--aidj-magenta)',
};

const YOU_LABEL: Record<UserQueued, string> = { next: 'You · Play next', end: 'You · Queued', now: 'You · Played now' };

/**
 * You win over AI DJ / Autoplay (adding a song yourself is the latest intent), then Autoplay, then AI DJ;
 * anything else in a radio session came from the radio. Songs from the list you started get no tag.
 */
export function queueSourceOf(
  id: string,
  s: { userIds: Record<string, UserQueued>; aiIds: Set<string>; autoplayIds: Set<string>; radio: boolean },
): QueueSourceInfo | null {
  const mine = s.userIds[id];
  if (mine) return { source: 'you', label: YOU_LABEL[mine], color: COLOR.you };
  if (s.autoplayIds.has(id)) return { source: 'autoplay', label: 'Autoplay', color: COLOR.autoplay };
  if (s.aiIds.has(id)) return { source: 'ai', label: 'AI DJ', color: COLOR.ai };
  if (s.radio) return { source: 'radio', label: 'Radio', color: COLOR.radio };
  return null;
}
