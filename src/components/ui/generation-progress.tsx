/**
 * Generation Progress Component - Story 7.4
 * Shows staged progress during playlist/recommendation generation
 */

import { cn } from '@/lib/utils';
import { Check, Loader2, Circle } from 'lucide-react';

export type GenerationStage = 'idle' | 'generating' | 'resolving' | 'retrying' | 'done';

interface GenerationProgressProps {
  stage: GenerationStage;
  className?: string;
  retryCount?: number;
  maxRetries?: number;
}

const STAGES = [
  { id: 'generating', label: 'Generating recommendations', activeLabel: 'Generating recommendations...' },
  { id: 'resolving', label: 'Finding songs in library', activeLabel: 'Finding songs in your library...' },
  { id: 'done', label: 'Complete', activeLabel: 'Complete!' },
];

function getStageIndex(stage: GenerationStage): number {
  if (stage === 'idle') return -1;
  if (stage === 'retrying') return 0; // Show as generating
  return STAGES.findIndex(s => s.id === stage);
}

export function GenerationProgress({
  stage,
  className,
  retryCount = 0,
  maxRetries = 3,
}: GenerationProgressProps) {
  const currentIndex = getStageIndex(stage);

  if (stage === 'idle') return null;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Progress bar */}
      <div className="relative">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500 ease-out"
            style={{
              width: stage === 'done' ? '100%' : `${((currentIndex + 1) / STAGES.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Stage list */}
      <div className="space-y-2">
        {STAGES.map((s, index) => {
          const isComplete = index < currentIndex || stage === 'done';
          const isCurrent = index === currentIndex && stage !== 'done';
          const isPending = index > currentIndex;

          return (
            <div
              key={s.id}
              className={cn(
                'flex items-center gap-3 text-sm transition-all duration-300',
                isComplete && 'text-green-600 dark:text-green-400',
                isCurrent && 'text-foreground font-medium',
                isPending && 'text-muted-foreground/50'
              )}
            >
              {isComplete ? (
                <Check className="h-4 w-4 flex-shrink-0" />
              ) : isCurrent ? (
                <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
              ) : (
                <Circle className="h-4 w-4 flex-shrink-0" />
              )}
              <span>
                {isCurrent ? s.activeLabel : s.label}
                {isCurrent && stage === 'retrying' && retryCount > 0 && (
                  <span className="text-xs text-muted-foreground ml-2">
                    (retry {retryCount}/{maxRetries})
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Estimated time */}
      {stage !== 'done' && (
        <p className="text-xs text-muted-foreground text-center">
          Usually takes about 5-10 seconds
        </p>
      )}
    </div>
  );
}

/**
 * Compact inline progress indicator
 */
interface InlineProgressProps {
  stage: GenerationStage;
  className?: string;
}

export function InlineProgress({ stage, className }: InlineProgressProps) {
  if (stage === 'idle' || stage === 'done') return null;

  const label = stage === 'generating'
    ? 'Generating...'
    : stage === 'resolving'
      ? 'Finding songs...'
      : 'Retrying...';

  return (
    <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}
