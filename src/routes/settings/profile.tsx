import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, LogOut, Mail, User } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import authClient from '@/lib/auth/auth-client';
import { YouAvatar, initialOf } from '@/components/glass/YouSheet';
import { SettingsBlock, SettingsHero, SettingsLinkRow, SettingsRow, SettingsSection, SettingsStack } from '@/components/settings/settings-ui';

export function ProfileSettings() {
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
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

  const user = session.user as typeof session.user & { role?: string | null };
  const name = displayName.trim();
  const unchanged = name === (user.name ?? '');
  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || unchanged) return;
    setIsUpdating(true);
    const { error } = await authClient.updateUser({ name });
    setIsUpdating(false);
    if (error) {
      toast.error(error.message || 'Couldn’t update your name');
      return;
    }
    toast.success('Name updated');
    setEditing(false);
  };
  const signOut = async () => {
    await authClient.signOut();
    queryClient.clear();
    navigate({ to: '/login' });
  };
  const since = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }).toUpperCase()
    : null;

  return (
    <SettingsStack>
      <SettingsHero className="flex flex-col items-center gap-2.5 !pb-5 !pt-6 text-center">
        <YouAvatar letter={initialOf(user)} className="size-24 text-[40px]" />
        <p className="font-display text-[22px] font-extrabold tracking-[-0.02em]">{user.name || 'You'}</p>
        <p className="text-[13px] text-muted-foreground">
          {user.email}
          {user.role === 'admin' ? ' · Admin' : ''}
        </p>
        {since && <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground">MEMBER SINCE {since}</p>}
      </SettingsHero>

      <SettingsSection title="Account">
        {editing ? (
          <SettingsBlock>
            <form onSubmit={saveName} className="space-y-2">
              <Label htmlFor="displayName">Name</Label>
              <div className="flex gap-2">
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  maxLength={80}
                  autoFocus
                />
                <Button type="submit" disabled={isUpdating || !name || unchanged}>
                  {isUpdating ? <Loader2 className="size-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
              <button type="button" className="text-[13px] font-semibold text-muted-foreground" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </form>
          </SettingsBlock>
        ) : (
          <SettingsLinkRow icon={<User />} label="Name" value={user.name || 'Add'} onClick={() => setEditing(true)} />
        )}
        <SettingsRow icon={<Mail />} label="Email" description="Used to sign in">
          <span className="max-w-[50%] truncate text-sm text-muted-foreground">{user.email}</span>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection>
        <button
          type="button"
          onClick={signOut}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 text-[15px] font-bold text-destructive [-webkit-tap-highlight-color:transparent] active:bg-foreground/5"
        >
          <LogOut className="size-[18px]" />
          Sign out
        </button>
      </SettingsSection>
    </SettingsStack>
  );
}
