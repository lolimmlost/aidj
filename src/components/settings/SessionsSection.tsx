import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import authClient from '@/lib/auth/auth-client';
import { toast } from '@/lib/toast';
import { SettingsBlock, SettingsRow, SettingsSection, StatusPill } from './settings-ui';

interface SessionRow {
  token: string;
  userAgent?: string | null;
  updatedAt: Date | string;
  createdAt: Date | string;
}

/** "Safari · iPhone" from a user agent; good enough to recognise your own devices. */
export function describeDevice(ua: string | null | undefined): { name: string; kind: 'phone' | 'tablet' | 'desktop' } {
  const s = ua ?? '';
  const os = /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Android/.test(s) ? 'Android' : /Mac OS X|Macintosh/.test(s) ? 'Mac' : /Windows/.test(s) ? 'Windows' : /Linux|X11/.test(s) ? 'Linux' : 'Unknown device';
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera|OPT\//.test(s) ? 'Opera' : /Firefox\/|FxiOS/.test(s) ? 'Firefox' : /CriOS|Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Browser';
  const kind = os === 'iPhone' || (os === 'Android' && /Mobile/.test(s)) ? 'phone' : os === 'iPad' || os === 'Android' ? 'tablet' : 'desktop';
  return { name: `${browser} · ${os}`, kind };
}

function ago(when: Date | string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(when).getTime()) / 60000));
  if (mins < 2) return 'active now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Devices signed in to this account, with a way to sign the others out. */
export function SessionsSection() {
  const { data: current } = authClient.useSession();
  const queryClient = useQueryClient();
  const currentToken = current?.session?.token;
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: async () => {
      const { data, error } = await authClient.listSessions();
      if (error) throw new Error(error.message);
      return (data ?? []) as SessionRow[];
    },
    staleTime: 30_000,
  });

  const signOut = async (token: string) => {
    const { error } = await authClient.revokeSession({ token });
    if (error) {
      toast.error(error.message || 'Couldn’t sign that device out');
      return;
    }
    toast.success('Signed out');
    queryClient.invalidateQueries({ queryKey: ['auth-sessions'] });
  };
  const signOutOthers = async () => {
    const { error } = await authClient.revokeOtherSessions();
    if (error) {
      toast.error(error.message || 'Couldn’t sign the other devices out');
      return;
    }
    toast.success('Signed out everywhere else');
    queryClient.invalidateQueries({ queryKey: ['auth-sessions'] });
  };

  const sorted = [...sessions].sort((a, b) =>
    a.token === currentToken ? -1 : b.token === currentToken ? 1 : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const others = sorted.filter((s) => s.token !== currentToken).length;

  return (
    <SettingsSection title="Signed in">
      {isLoading && (
        <SettingsBlock>
          <p className="text-[13px] text-muted-foreground">Loading devices…</p>
        </SettingsBlock>
      )}
      {sorted.map((s) => {
        const device = describeDevice(s.userAgent);
        const Icon = device.kind === 'phone' ? Smartphone : device.kind === 'tablet' ? Tablet : Monitor;
        const isCurrent = s.token === currentToken;
        return (
          <SettingsRow key={s.token} icon={<Icon />} label={device.name} description={isCurrent ? 'Signed in now' : ago(s.updatedAt)}>
            {isCurrent ? (
              <StatusPill tone="accent">This device</StatusPill>
            ) : (
              <Button variant="ghost" size="sm" className="shrink-0 rounded-full text-destructive" onClick={() => signOut(s.token)}>
                Sign out
              </Button>
            )}
          </SettingsRow>
        );
      })}
      {others > 1 && (
        <SettingsBlock>
          <Button variant="outline" className="h-11 w-full rounded-full" onClick={signOutOthers}>
            Sign out all other devices
          </Button>
        </SettingsBlock>
      )}
    </SettingsSection>
  );
}
