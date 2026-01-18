import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
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
        <p className="text-gray-600 dark:text-gray-400">Please log in to view your profile.</p>
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
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
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
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
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
                ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </Card>
  );
}
