import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'system', label: 'Auto', Icon: Monitor },
] as const;

/**
 * Light / Dark / Auto (follows the OS). Same store as the desktop ThemeToggle, so the two stay in sync.
 * `compact` shows icons only, for a row that also carries a label (the You sheet).
 */
export function ThemeSegmented({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={cn('grid grid-cols-3 gap-1 rounded-full bg-foreground/[0.07] p-1', className)}>
      {OPTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={theme === id}
          aria-label={compact ? label : undefined}
          title={compact ? label : undefined}
          onClick={() => setTheme(id)}
          className={cn(
            'flex h-10 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-semibold transition-colors touch-manipulation [-webkit-tap-highlight-color:transparent]',
            theme === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
          )}
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          {!compact && label}
        </button>
      ))}
    </div>
  );
}
