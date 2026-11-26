import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Github, Loader2, User } from 'lucide-react';
import { toast } from '@/lib/toast';
import authClient from '@/lib/auth/auth-client';
import { useAuthOptions } from '@/lib/auth/use-auth-options';
import { YouAvatar, initialOf } from '@/components/glass/YouSheet';
import { SettingsBlock, SettingsRow, SettingsSection, SettingsStack } from '@/components/settings/settings-ui';

export function ProfileSettings() {
  const { data: session } = authClient.useSession();
  const [displayName, setDisplayName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (session?.user?.name) setDisplayName(session.user.name);
  }, [session?.user?.name]);

  if (!session) {
    return (
      <SettingsSection title="Profile">
        <SettingsBlock>
          <p className="text-muted-foreground">Sign in to see your profile.</p>
        </SettingsBlock>
      </SettingsSection>
    );
  }

  const name = displayName.trim();
  const unchanged = name === (session.user.name ?? '');
  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || unchanged) return;
    setIsUpdating(true);
    const { error } = await authClient.updateUser({ name });
    setIsUpdating(false);
    if (error) toast.error(error.message || 'Couldn’t update your name');
    else toast.success('Name updated');
  };

  const created = session.user.createdAt
    ? new Date(session.user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <SettingsStack>
      <SettingsSection title="Account" icon={<User />}>
        <SettingsBlock>
          <div className="flex items-center gap-3">
            <YouAvatar letter={initialOf(session.user)} className="size-12 shrink-0 text-[19px]" />
            <div className="min-w-0">
              <p className="truncate text-[17px] font-bold">{session.user.name || 'You'}</p>
              <p className="truncate text-[13px] text-muted-foreground">{session.user.email}</p>
            </div>
          </div>
        </SettingsBlock>
        <SettingsBlock>
          <form onSubmit={saveName} className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <div className="flex gap-2">
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                maxLength={80}
              />
              <Button type="submit" disabled={isUpdating || !name || unchanged}>
                {isUpdating ? <Loader2 className="size-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </form>
        </SettingsBlock>
        <SettingsRow label="Email" description="Used to sign in; can’t be changed here">
          <span className="max-w-[45%] truncate text-sm text-muted-foreground">{session.user.email}</span>
        </SettingsRow>
        {created && (
          <SettingsRow label="Member since">
            <span className="text-sm text-muted-foreground">{created}</span>
          </SettingsRow>
        )}
      </SettingsSection>
      <ConnectedAccounts />
    </SettingsStack>
  );
}

// Google icon SVG (lucide doesn't include it)
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

interface LinkedAccount {
  provider: string;
  accountId?: string;
}

function ConnectedAccounts() {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  // Fetch linked accounts on mount
  useEffect(() => {
    async function fetchAccounts() {
      try {
        const result = await (authClient as unknown as { listAccounts?: () => Promise<{ data?: Array<{ provider: string; accountId: string }> }> }).listAccounts?.();
        if (result?.data) {
          setAccounts(result.data);
        }
      } catch {
        // listAccounts may not be available — that's OK
      } finally {
        setLoading(false);
      }
    }
    fetchAccounts();
  }, []);

  const isConnected = (provider: string) =>
    accounts.some(a => a.provider === provider);

  const handleConnect = async (provider: 'github' | 'google') => {
    setConnecting(provider);
    try {
      await (authClient as unknown as { linkSocial: (opts: { provider: string; callbackURL: string }) => Promise<void> }).linkSocial({
        provider,
        callbackURL: '/settings?tab=profile',
      });
      // Will redirect to OAuth provider
    } catch {
      toast.error(`Failed to connect ${provider}`);
      setConnecting(null);
    }
  };

  const handleDisconnect = async (provider: string) => {
    setConnecting(provider);
    try {
      const account = accounts.find(a => a.provider === provider);
      if (account?.accountId) {
        await (authClient as unknown as { unlinkAccount?: (opts: { providerId: string }) => Promise<void> }).unlinkAccount?.({ providerId: provider });
        setAccounts(prev => prev.filter(a => a.provider !== provider));
        toast.success(`Disconnected ${provider}`);
      }
    } catch {
      toast.error(`Failed to disconnect ${provider}`);
    } finally {
      setConnecting(null);
    }
  };

  const options = useAuthOptions();
  const providers = [
    { id: 'github' as const, name: 'GitHub', icon: <Github className="h-5 w-5" /> },
    { id: 'google' as const, name: 'Google', icon: <GoogleIcon className="h-5 w-5" /> },
  ].filter((p) => options[p.id]);

  // No social sign-in configured on this server: nothing to link (and no dead buttons).
  if (providers.length === 0) return null;

  return (
    <SettingsSection title="Sign-in methods" description="Link an account for one-tap sign-in">
      {providers.map(({ id, name, icon }) => {
        const connected = isConnected(id);
        const busy = connecting === id;
        return (
          <SettingsRow
            key={id}
            label={<span className="flex items-center gap-2 [&_svg]:size-4">{icon}{name}</span>}
            description={loading ? 'Checking…' : connected ? 'Connected' : 'Not connected'}
          >
            {!loading && (
              <Button
                variant={connected ? 'outline' : 'default'}
                size="sm"
                disabled={busy}
                onClick={() => (connected ? handleDisconnect(id) : handleConnect(id))}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : connected ? 'Disconnect' : 'Connect'}
              </Button>
            )}
          </SettingsRow>
        );
      })}
    </SettingsSection>
  );
}
