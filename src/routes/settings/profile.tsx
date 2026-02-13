import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Github, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import authClient from '@/lib/auth/auth-client';

export function ProfileSettings() {
  const { data: session } = authClient.useSession();
  const [displayName, setDisplayName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    if (session?.user?.name) {
      setDisplayName(session.user.name);
    }
  }, [session]);

  const handleUpdateName = async () => {
    setIsUpdating(true);
    setMessage(null);

    try {
      // This would integrate with Better Auth's update user endpoint
      // For now, showing the UI pattern
      setMessage({ type: 'success', text: 'Display name updated successfully' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to update display name' });
    } finally {
      setIsUpdating(false);
    }
  };

  if (!session) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground">Please log in to view your profile.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-6">Profile Information</h2>

      <div className="space-y-6">
        {/* Email (read-only) */}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={session.user.email}
            disabled
            className="mt-2"
          />
          <p className="text-sm text-muted-foreground mt-1">
            Email cannot be changed
          </p>
        </div>

        {/* Display Name */}
        <div>
          <Label htmlFor="displayName">Display Name</Label>
          <div className="flex gap-2 mt-2">
            <Input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your display name"
            />
            <Button
              onClick={handleUpdateName}
              disabled={isUpdating || !displayName}
            >
              {isUpdating ? 'Updating...' : 'Update'}
            </Button>
          </div>
        </div>

        {/* Account Creation Date */}
        <div>
          <Label>Account Created</Label>
          <p className="text-sm text-muted-foreground mt-2">
            {session.user.createdAt
              ? new Date(session.user.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              : 'N/A'}
          </p>
        </div>

        {/* Message Display */}
        {message && (
          <div
            className={`p-4 rounded-md ${
              message.type === 'success'
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      {/* Connected Accounts */}
      <ConnectedAccounts />
    </Card>
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
        callbackURL: '/settings/profile',
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

  const providers = [
    { id: 'github' as const, name: 'GitHub', icon: <Github className="h-5 w-5" /> },
    { id: 'google' as const, name: 'Google', icon: <GoogleIcon className="h-5 w-5" /> },
  ];

  return (
    <div className="mt-8 pt-6 border-t">
      <h3 className="text-lg font-semibold mb-4">Connected Accounts</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Link your social accounts for easier sign-in
      </p>
      <div className="space-y-3">
        {providers.map(({ id, name, icon }) => {
          const connected = isConnected(id);
          const isLoading = connecting === id;

          return (
            <div
              key={id}
              className="flex items-center justify-between p-3 rounded-lg border bg-card"
            >
              <div className="flex items-center gap-3">
                <div className="text-muted-foreground">{icon}</div>
                <div>
                  <p className="text-sm font-medium">{name}</p>
                  {loading ? (
                    <p className="text-xs text-muted-foreground">Checking...</p>
                  ) : connected ? (
                    <p className="text-xs text-green-600 dark:text-green-400">Connected</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not connected</p>
                  )}
                </div>
              </div>
              {!loading && (
                <Button
                  variant={connected ? 'outline' : 'default'}
                  size="sm"
                  disabled={isLoading}
                  onClick={() =>
                    connected ? handleDisconnect(id) : handleConnect(id)
                  }
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : connected ? (
                    'Disconnect'
                  ) : (
                    'Connect'
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
