// Story 7.5: Mix Compatibility Badges for Pro DJ Features
// Displays BPM, key (Camelot), and overall mix score for recommendations

import { cn } from '@/lib/utils';
import { getCamelotKey, areCamelotKeysCompatible } from '@/lib/types/song';

interface MixCompatibilityBadgesProps {
  // Current playing track (for comparison)
  currentBpm?: number;
  currentKey?: string;
  // Candidate track
  candidateBpm?: number;
  candidateKey?: string;
  // Optional: pre-calculated mix score (0-100)
  mixScore?: number;
  // Display options
  compact?: boolean;
  showLabel?: boolean;
  className?: string;
}

// BPM compatibility thresholds
const BPM_THRESHOLDS = {
  SEAMLESS: 3, // ±3% = seamless transition
  MANAGEABLE: 6, // ±6% = manageable with pitch adjustment
  DIFFICULT: 10, // ±10% = requires technique
};

/**
 * Calculate BPM compatibility between two tracks
 */
function getBpmCompatibility(currentBpm: number, candidateBpm: number): {
  score: number;
  diff: number;
  diffPercent: number;
  relationship: string;
} {
  // Guard against division by zero
  if (currentBpm <= 0 || candidateBpm <= 0) {
    return { score: 0.5, diff: 0, diffPercent: 0, relationship: 'Unknown' };
  }

  const diff = candidateBpm - currentBpm;
  const diffPercent = Math.abs(diff / currentBpm) * 100;

  // Check for half-time / double-time relationships
  const halfTimeDiff = Math.abs(candidateBpm - currentBpm / 2);
  const doubleTimeDiff = Math.abs(candidateBpm - currentBpm * 2);
  const halfTimePercent = (halfTimeDiff / (currentBpm / 2)) * 100;
  const doubleTimePercent = (doubleTimeDiff / (currentBpm * 2)) * 100;

  // Half-time match
  if (halfTimePercent < BPM_THRESHOLDS.SEAMLESS) {
    return { score: 0.85, diff, diffPercent, relationship: 'Half-time' };
  }
  // Double-time match
  if (doubleTimePercent < BPM_THRESHOLDS.SEAMLESS) {
    return { score: 0.85, diff, diffPercent, relationship: 'Double-time' };
  }

  // Direct BPM comparison
  if (diffPercent <= BPM_THRESHOLDS.SEAMLESS) {
    return { score: 1.0, diff, diffPercent, relationship: 'Seamless' };
  }
  if (diffPercent <= BPM_THRESHOLDS.MANAGEABLE) {
    return { score: 0.8, diff, diffPercent, relationship: 'Manageable' };
  }
  if (diffPercent <= BPM_THRESHOLDS.DIFFICULT) {
    return { score: 0.5, diff, diffPercent, relationship: 'Requires technique' };
  }

  return { score: 0.3, diff, diffPercent, relationship: 'Difficult' };
}

/**
 * BPM Badge Component
 */
export function BpmBadge({
  currentBpm,
  candidateBpm,
  compact = false,
  showLabel = true,
}: {
  currentBpm?: number;
  candidateBpm?: number;
  compact?: boolean;
  showLabel?: boolean;
}) {
  if (!candidateBpm) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        'bg-muted text-muted-foreground',
        compact && 'px-1.5 py-0'
      )}>
        {showLabel && <span className="opacity-60">BPM</span>}
        <span>--</span>
      </span>
    );
  }

  const bpm = Math.round(candidateBpm);

  // No comparison available
  if (!currentBpm) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
        compact && 'px-1.5 py-0'
      )}>
        {showLabel && <span className="opacity-60">BPM</span>}
        <span>{bpm}</span>
      </span>
    );
  }

  const { score, diff, relationship } = getBpmCompatibility(currentBpm, candidateBpm);
  const diffDisplay = diff > 0 ? `+${Math.round(diff)}` : Math.round(diff).toString();

  // Color based on compatibility
  const colorClasses = score >= 0.8
    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
    : score >= 0.5
    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        colorClasses,
        compact && 'px-1.5 py-0'
      )}
      title={`${relationship}: ${bpm} BPM (${diffDisplay} from current)`}
    >
      {showLabel && <span className="opacity-60">BPM</span>}
      <span>{bpm}</span>
      {diff !== 0 && (
        <span className="opacity-70">{diffDisplay}</span>
      )}
    </span>
  );
}

/**
 * Key Badge Component (Camelot notation)
 */
export function KeyBadge({
  currentKey,
  candidateKey,
  compact = false,
  showLabel = true,
}: {
  currentKey?: string;
  candidateKey?: string;
  compact?: boolean;
  showLabel?: boolean;
}) {
  const camelotKey = getCamelotKey(candidateKey);

  if (!candidateKey || !camelotKey) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        'bg-muted text-muted-foreground',
        compact && 'px-1.5 py-0'
      )}>
        {showLabel && <span className="opacity-60">Key</span>}
        <span>--</span>
      </span>
    );
  }

  // No comparison available
  const currentCamelot = getCamelotKey(currentKey);
  if (!currentKey || !currentCamelot) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
        compact && 'px-1.5 py-0'
      )}>
        {showLabel && <span className="opacity-60">Key</span>}
        <span>{camelotKey}</span>
      </span>
    );
  }

  const { score, relationship } = areCamelotKeysCompatible(currentCamelot, camelotKey);

  // Color based on compatibility
  const colorClasses = score >= 0.85
    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
    : score >= 0.6
    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        colorClasses,
        compact && 'px-1.5 py-0'
      )}
      title={`${relationship}: ${camelotKey} (${candidateKey})`}
    >
      {showLabel && <span className="opacity-60">Key</span>}
      <span>{camelotKey}</span>
    </span>
  );
}

/**
 * Mix Score Badge Component (overall compatibility 0-100)
 */
export function MixScoreBadge({
  score,
  compact = false,
  showLabel = true,
}: {
  score?: number;
  compact?: boolean;
  showLabel?: boolean;
}) {
  if (score === undefined || score === null) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        'bg-muted text-muted-foreground',
        compact && 'px-1.5 py-0'
      )}>
        {showLabel && <span className="opacity-60">Mix</span>}
        <span>--</span>
      </span>
    );
  }

  const displayScore = Math.round(score * 100);

  // Color based on score
  const colorClasses = displayScore >= 80
    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
    : displayScore >= 60
    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        colorClasses,
        compact && 'px-1.5 py-0'
      )}
      title={`Mix compatibility: ${displayScore}%`}
    >
      {showLabel && <span className="opacity-60">Mix</span>}
      <span>{displayScore}</span>
    </span>
  );
}

/**
 * Combined Mix Compatibility Badges
 */
export function MixCompatibilityBadges({
  currentBpm,
  currentKey,
  candidateBpm,
  candidateKey,
  mixScore,
  compact = false,
  showLabel = true,
  className,
}: MixCompatibilityBadgesProps) {
  // Calculate overall mix score if not provided
  let calculatedScore = mixScore;
  if (calculatedScore === undefined && currentBpm && currentKey && candidateBpm && candidateKey) {
    const bpmCompat = getBpmCompatibility(currentBpm, candidateBpm);
    const currentCamelot = getCamelotKey(currentKey);
    const candidateCamelot = getCamelotKey(candidateKey);

    let keyScore = 0.5; // Default if can't calculate
    if (currentCamelot && candidateCamelot) {
      const keyCompat = areCamelotKeysCompatible(currentCamelot, candidateCamelot);
      keyScore = keyCompat.score;
    }

    // Weight: 40% BPM, 40% Key, 20% baseline
    calculatedScore = (bpmCompat.score * 0.4) + (keyScore * 0.4) + 0.2;
  }

  return (
    <div className={cn('flex items-center gap-1.5 flex-wrap', className)}>
      <BpmBadge
        currentBpm={currentBpm}
        candidateBpm={candidateBpm}
        compact={compact}
        showLabel={showLabel}
      />
      <KeyBadge
        currentKey={currentKey}
        candidateKey={candidateKey}
        compact={compact}
        showLabel={showLabel}
      />
      {calculatedScore !== undefined && (
        <MixScoreBadge
          score={calculatedScore}
          compact={compact}
          showLabel={showLabel}
        />
      )}
    </div>
  );
}

export default MixCompatibilityBadges;
