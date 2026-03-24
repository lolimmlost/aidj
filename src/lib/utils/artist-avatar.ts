/** Deterministic gradient + initials for artist bubble avatars */

const GRADIENTS = [
  'from-amber-500 to-orange-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-indigo-600',
  'from-cyan-500 to-blue-600',
  'from-sky-500 to-indigo-600',
  'from-rose-500 to-pink-600',
  'from-green-500 to-emerald-600',
  'from-purple-500 to-violet-600',
  'from-pink-500 to-rose-600',
  'from-blue-500 to-cyan-600',
  'from-indigo-500 to-purple-600',
  'from-red-500 to-orange-600',
  'from-teal-500 to-cyan-600',
  'from-fuchsia-500 to-pink-600',
  'from-yellow-500 to-amber-600',
];

export function getArtistGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export function getArtistInitials(name: string): string {
  return name
    .split(/[\s&,]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
