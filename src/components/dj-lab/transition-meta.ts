import type { TransitionRole, TransitionStatus } from '@/lib/db/schema/known-transitions.schema';

/** Known transitions: role and status labels and colours, shared by the book, the set review and the Lab. */
export const ROLE_META: Record<TransitionRole, { label: string; cls: string; on: string }> = {
  stable: { label: 'Stable', cls: 'border-emerald-300/70 text-emerald-300', on: 'bg-emerald-300 text-black border-emerald-300' },
  build: { label: 'Build up', cls: 'border-orange-300/70 text-orange-300', on: 'bg-orange-300 text-black border-orange-300' },
  plateau: { label: 'Plateau', cls: 'border-violet-300/70 text-violet-300', on: 'bg-violet-300 text-black border-violet-300' },
  breather: { label: 'Breather', cls: 'border-sky-300/70 text-sky-300', on: 'bg-sky-300 text-black border-sky-300' },
  cooldown: { label: 'Cooldown', cls: 'border-cyan-300/70 text-cyan-300', on: 'bg-cyan-300 text-black border-cyan-300' },
};
export const ROLES = Object.keys(ROLE_META) as TransitionRole[];
export const STATUS_META: Record<TransitionStatus, { label: string; sub: string }> = {
  lab: { label: 'From Lab', sub: 'Mixed in a Lab set, not judged yet' },
  proven: { label: 'Proven', sub: 'You vouch for it' },
  needs_work: { label: 'Needs work', sub: 'Close, not there yet' },
  idea: { label: 'Idea', sub: 'Worth trying' },
};

