import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronRight, Disc3, ImageIcon, Layers, Palette, Play, Server, Shield, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import authClient from '@/lib/auth/auth-client';
import { useTheme } from '@/components/theme-provider';
import { usePreferencesStore } from '@/lib/stores/preferences';
import { useAudioStore } from '@/lib/stores/audio';
import { setGlassUi, useGlassUi } from '@/lib/hooks/useGlassUi';
import { setLowMotion, useLowMotion } from '@/lib/hooks/useLowMotion';
import { toast } from '@/lib/toast';
import { HERO_WASH } from '@/components/settings/settings-ui';
import { YouAvatar, initialOf } from './YouSheet';
import { ThemeSegmented } from './ThemeSegmented';

/** Settings pages on glass phones, one per row (the classic layout shows them as tabs). */
export type GlassSettingsTab =
  | 'profile'
  | 'playback'
  | 'ai-dj'
  | 'appearance'
  | 'security'
  | 'services'
  | 'cover-art';

export const GLASS_SETTINGS_TITLES: Record<GlassSettingsTab, string> = {
  profile: 'Profile',
  playback: 'Playback',
  'ai-dj': 'AI DJ',
  appearance: 'Appearance',
  security: 'Security',
  services: 'Services',
  'cover-art': 'Album art',
};

interface Row {
  tab: GlassSettingsTab;
  icon: ReactNode;
  admin?: boolean;
}

// Profile isn't a row: the card at the top opens it.
const GROUPS: Row[][] = [
  [
    { tab: 'playback', icon: <Play /> },
    { tab: 'ai-dj', icon: <Sparkles /> },
    { tab: 'appearance', icon: <Palette /> },
    { tab: 'security', icon: <Shield /> },
  ],
  [
    { tab: 'services', icon: <Server />, admin: true },
    { tab: 'cover-art', icon: <ImageIcon />, admin: true },
  ],
];

const THEME_NAMES: Record<string, string> = { light: 'Light', dark: 'Dark', system: 'Auto' };

/** The value shown on the right of each row: the setting as it is now. */
function useRowValues(twoFactor: boolean): Partial<Record<GlassSettingsTab, { text: string; good?: boolean }>> {
  const prefs = usePreferencesStore((s) => s.preferences);
  const { theme } = useTheme();
  const recs = prefs.recommendationSettings;
  const fade = prefs.playbackSettings?.crossfadeDuration ?? 0;
  return {
    playback: { text: fade > 0 ? `Crossfade ${fade} s` : 'No crossfade' },
    'ai-dj': { text: recs.aiEnabled && recs.aiDJEnabled ? `Every ${recs.aiDJDripInterval ?? 3}` : 'Off' },
    appearance: { text: THEME_NAMES[theme] ?? 'Auto' },
    security: twoFactor ? { text: '2FA on', good: true } : { text: 'Password only' },
  };
}

/** A big tap target that switches something on or off right here (canvas "SetIndexControl"). */
function QuickTile({
  icon,
  label,
  state,
  on,
  disabled,
  wide,
  onToggle,
}: {
  icon: ReactNode;
  label: string;
  state: string;
  on: boolean;
  disabled?: boolean;
  wide?: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onToggle(!on)}
      className={cn(
        'glass-surface flex min-h-16 items-center gap-2.5 rounded-[22px] p-3.5 text-left text-foreground transition-[background,opacity] touch-manipulation [-webkit-tap-highlight-color:transparent] active:scale-[0.98] disabled:opacity-50',
        wide && 'col-span-2',
        on && HERO_WASH,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid size-[38px] shrink-0 place-items-center rounded-full transition-colors [&_svg]:size-[18px]',
          on ? 'bg-foreground text-background' : 'bg-foreground/[0.12] text-foreground',
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold">{label}</span>
        <span className="truncate text-xs text-muted-foreground">{state}</span>
      </span>
    </button>
  );
}

/**
 * The glass Settings index, "Control centre" (canvas "SetIndexControl"): your profile card, quick
 * switches you can flip without opening a page, then one row per page with its current value.
 */
export function GlassSettingsIndex({ isAdmin, active }: { isAdmin: boolean; /** Split view: the open page's row is highlighted. */ active?: GlassSettingsTab }) {
  const { data: session } = authClient.useSession();
  const user = session?.user as { name?: string | null; email?: string | null; twoFactorEnabled?: boolean | null } | undefined;
  const values = useRowValues(!!user?.twoFactorEnabled);
  const recs = usePreferencesStore((s) => s.preferences.recommendationSettings);
  const glass = useGlassUi();
  const lowMotion = useLowMotion();
  const djOn = recs.aiEnabled && recs.aiDJEnabled;
  const every = recs.aiDJDripInterval ?? 3;

  return (
    <div className="flex flex-col gap-5 pb-6">
      <Link
        to="/settings"
        search={{ tab: 'profile' }}
        aria-current={active === 'profile' ? 'page' : undefined}
        className={cn(
          'glass-surface flex items-center gap-3.5 rounded-[24px] p-3.5 text-foreground [-webkit-tap-highlight-color:transparent] active:bg-foreground/5',
          active === 'profile' && 'bg-primary/20',
        )}
      >
        <YouAvatar letter={initialOf(user ?? undefined)} className="size-14 text-2xl" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-display text-[19px] font-extrabold">{user?.name || 'Profile'}</span>
          <span className="truncate text-[13px] text-muted-foreground">
            {[user?.email, isAdmin ? 'Admin' : null].filter(Boolean).join(' · ')}
          </span>
        </span>
        {!active && <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />}
      </Link>

      <section aria-labelledby="settings-quick" className="flex flex-col gap-2.5">
        <h2 id="settings-quick" className="px-1 font-mono text-[11px] font-medium tracking-[0.14em] text-muted-foreground">
          QUICK
        </h2>
        <div className="grid grid-cols-2 gap-2.5">
          <QuickTile
            wide
            icon={<Sparkles />}
            label="AI DJ"
            state={!recs.aiEnabled ? 'Turn on recommendations first' : djOn ? `On · every ${every} songs` : 'Off'}
            on={djOn}
            disabled={!recs.aiEnabled}
            // The player's own switch: also starts the DJ watching the queue, and saves the setting.
            onToggle={(v) => useAudioStore.getState().setAIDJEnabled(v)}
          />
          <QuickTile
            icon={<Layers />}
            label="Glass"
            state={glass ? 'On' : 'Off'}
            on={glass}
            onToggle={(v) => {
              if (!setGlassUi(v)) toast.error('Can’t save this setting (storage blocked)');
            }}
          />
          <QuickTile icon={<Disc3 />} label="Low motion" state={lowMotion ? 'On' : 'Off'} on={lowMotion} onToggle={setLowMotion} />
          <div className="glass-surface col-span-2 rounded-[22px] p-2.5">
            <ThemeSegmented />
          </div>
        </div>
      </section>

      {GROUPS.map((group) => {
        const rows = group.filter((r) => !r.admin || isAdmin);
        if (rows.length === 0) return null;
        return (
          <ul key={group[0].tab} className="glass-surface overflow-hidden rounded-[20px]">
            {rows.map((r, j) => {
              const value = values[r.tab];
              return (
                <li key={r.tab}>
                  {j > 0 && <div aria-hidden className="ml-[62px] h-px bg-foreground/10" />}
                  <Link
                    to="/settings"
                    search={{ tab: r.tab }}
                    aria-current={active === r.tab ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[54px] items-center gap-3 px-3.5 text-foreground [-webkit-tap-highlight-color:transparent] active:bg-foreground/5',
                      active === r.tab && 'bg-primary/20',
                    )}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary/15 text-primary [&_svg]:size-[18px]">
                      {r.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{GLASS_SETTINGS_TITLES[r.tab]}</span>
                    {value != null && (
                      <span className={cn('shrink-0 text-[14px] tabular-nums', value.good ? 'font-semibold text-success' : 'text-muted-foreground')}>
                        {value.text}
                      </span>
                    )}
                    {!active && <ChevronRight className="-ml-1 size-[18px] shrink-0 text-muted-foreground/70" aria-hidden />}
                  </Link>
                </li>
              );
            })}
          </ul>
        );
      })}
    </div>
  );
}

/** A grouped glass list for settings rows (the Appearance page; other pages keep their cards for now). */
export function GlassGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('glass-surface overflow-hidden rounded-[20px]', className)}>{children}</div>;
}

export function GlassRow({ icon, label, sub, children }: { icon: ReactNode; label: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-[60px] items-center gap-3 px-3.5 py-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary/15 text-primary [&_svg]:size-[18px]">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold">{label}</span>
        {sub && <span className="text-[13px] text-muted-foreground">{sub}</span>}
      </span>
      {children}
    </div>
  );
}

export function GlassSeparator() {
  return <div aria-hidden className="ml-[62px] h-px bg-foreground/10" />;
}
