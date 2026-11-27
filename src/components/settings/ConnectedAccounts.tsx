import { useEffect, useState } from 'react';
import { Github, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import authClient from '@/lib/auth/auth-client';
import { useAuthOptions } from '@/lib/auth/use-auth-options';
import { SettingsRow, SettingsSection } from './settings-ui';

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

/** Linked GitHub / Google accounts. Shown on the Security page, with the other ways you sign in. */
export function ConnectedAccounts() {
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
        callbackURL: '/settings?tab=security',
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
    <SettingsSection title="Linked accounts" description="Sign in with one tap">
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
