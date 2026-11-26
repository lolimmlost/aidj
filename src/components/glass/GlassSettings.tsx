import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Bell, ChevronRight, ImageIcon, Palette, Play, Server, Shield, Sparkles, User } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Settings pages on glass phones, one per row (the classic layout shows them as tabs). */
export type GlassSettingsTab =
  | 'profile'
  | 'playback'
  | 'ai-dj'
  | 'notifications'
  | 'appearance'
  | 'security'
  | 'services'
  | 'cover-art'
  | 'general';

export const GLASS_SETTINGS_TITLES: Record<GlassSettingsTab, string> = {
  profile: 'Profile',
  playback: 'Playback',
  'ai-dj': 'AI DJ',
  notifications: 'Notifications',
  appearance: 'Appearance',
  security: 'Security',
  services: 'Services',
  'cover-art': 'Album art',
  general: 'General',
};

interface Row {
  tab: GlassSettingsTab;
  sub: string;
  icon: ReactNode;
  admin?: boolean;
}

const GROUPS: Row[][] = [
  [
    { tab: 'profile', sub: 'Name and email', icon: <User /> },
    { tab: 'playback', sub: 'Volume, crossfade, quality, PG mode', icon: <Play /> },
    { tab: 'ai-dj', sub: 'Recommendations and AI DJ mode', icon: <Sparkles /> },
    { tab: 'notifications', sub: 'Downloads and recommendations', icon: <Bell /> },
  ],
  [
    { tab: 'appearance', sub: 'Theme, glass design, motion', icon: <Palette /> },
    { tab: 'security', sub: 'Password and two-factor', icon: <Shield /> },
    { tab: 'services', sub: 'Navidrome, Lidarr, Last.fm, LLM', icon: <Server />, admin: true },
    { tab: 'cover-art', sub: 'Find and fix missing covers', icon: <ImageIcon />, admin: true },
  ],
];

/** The glass Settings index (canvas "TodoSettings"): grouped glass lists, one row per page. */
export function GlassSettingsIndex({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex flex-col gap-5 pb-6">
      {GROUPS.map((group, i) => {
        const rows = group.filter((r) => !r.admin || isAdmin);
        return (
          <ul key={i} className="glass-surface overflow-hidden rounded-[20px]">
            {rows.map((r, j) => (
              <li key={r.tab}>
                {j > 0 && <div aria-hidden className="ml-[62px] h-px bg-foreground/10" />}
                <Link
                  to="/settings"
                  search={{ tab: r.tab }}
                  className="flex min-h-[60px] items-center gap-3 px-3.5 text-foreground [-webkit-tap-highlight-color:transparent] active:bg-foreground/5"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary/15 text-primary [&_svg]:size-[18px]">
                    {r.icon}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-semibold">{GLASS_SETTINGS_TITLES[r.tab]}</span>
                    <span className="truncate text-[13px] text-muted-foreground">{r.sub}</span>
                  </span>
                  <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
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
