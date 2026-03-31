import { Lock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface FeatureTeaserProps {
  title: string;
  description: string;
  icon: LucideIcon;
  progress: number;
  total: number;
  locked: boolean;
}

export function FeatureTeaser({
  title,
  description,
  icon: Icon,
  progress,
  total,
  locked,
}: FeatureTeaserProps) {
  const percentage = Math.min(Math.round((progress / total) * 100), 100);

  return (
    <div className="rounded-xl border bg-card p-5 opacity-75 relative">
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-muted p-2.5 text-muted-foreground relative">
          <Icon className="h-5 w-5" />
          {locked && (
            <Lock className="h-3 w-3 absolute -top-1 -right-1 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base text-muted-foreground">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground/70 mt-1">
            {description}
          </p>
          {locked && (
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Play more to unlock</span>
                <span>{progress}/{total} plays</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/40 rounded-full transition-all"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
