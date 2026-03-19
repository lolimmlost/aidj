import { createFileRoute, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  Activity,
  UserPlus,
  Clock,
  Shield,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/ui/page-layout';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/admin/')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
    if (context.user.role !== 'admin') {
      throw redirect({ to: '/dashboard' });
    }
  },
  component: AdminDashboard,
});

interface AdminStats {
  totalUsers: number;
  activeSessions: number;
  signupsToday: number;
  signupsThisWeek: number;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  createdAt: string;
}

function AdminDashboard() {
  const {
    data,
    isLoading,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/stats', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load admin stats');
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const stats: AdminStats = data?.stats ?? {
    totalUsers: 0,
    activeSessions: 0,
    signupsToday: 0,
    signupsThisWeek: 0,
  };
  const users: UserRow[] = data?.users ?? [];

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : '';

  return (
    <PageLayout
      title="Admin"
      description="Monitor users and system activity"
      icon={<Shield className="h-5 w-5" />}
      backLink="/dashboard"
      backLabel="Dashboard"
      actions={
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              Updated {lastUpdated}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-4 w-4 mr-1.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      }
    >
      {error && (
        <Card className="p-4 bg-destructive/10 border-destructive/30">
          <p className="text-destructive text-sm">{(error as Error).message}</p>
        </Card>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total Users"
          value={stats.totalUsers}
          icon={<Users className="h-4 w-4" />}
          loading={isLoading}
        />
        <StatCard
          label="Active Sessions"
          value={stats.activeSessions}
          icon={<Activity className="h-4 w-4" />}
          accent="green"
          loading={isLoading}
        />
        <StatCard
          label="Signups Today"
          value={stats.signupsToday}
          icon={<UserPlus className="h-4 w-4" />}
          accent="blue"
          loading={isLoading}
        />
        <StatCard
          label="This Week"
          value={stats.signupsThisWeek}
          icon={<Clock className="h-4 w-4" />}
          loading={isLoading}
        />
      </div>

      {/* Users Table */}
      <Card className="overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-sm">All Users</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 sm:px-6 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 sm:px-6 py-3 font-medium text-muted-foreground hidden sm:table-cell">Email</th>
                <th className="text-left px-4 sm:px-6 py-3 font-medium text-muted-foreground">Role</th>
                <th className="text-left px-4 sm:px-6 py-3 font-medium text-muted-foreground hidden md:table-cell">Joined</th>
                <th className="text-left px-4 sm:px-6 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-4 sm:px-6 py-3"><div className="h-4 w-24 bg-muted rounded animate-pulse" /></td>
                    <td className="px-4 sm:px-6 py-3 hidden sm:table-cell"><div className="h-4 w-36 bg-muted rounded animate-pulse" /></td>
                    <td className="px-4 sm:px-6 py-3"><div className="h-4 w-12 bg-muted rounded animate-pulse" /></td>
                    <td className="px-4 sm:px-6 py-3 hidden md:table-cell"><div className="h-4 w-20 bg-muted rounded animate-pulse" /></td>
                    <td className="px-4 sm:px-6 py-3"><div className="h-4 w-14 bg-muted rounded animate-pulse" /></td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    No users yet
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 sm:px-6 py-3">
                      <span className="font-medium">{u.name}</span>
                      <span className="block sm:hidden text-xs text-muted-foreground truncate max-w-[180px]">
                        {u.email}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-muted-foreground hidden sm:table-cell">
                      {u.email}
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      {u.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                          <ShieldAlert className="h-3 w-3" />
                          admin
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">user</span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-muted-foreground hidden md:table-cell">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      {u.banned ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                          banned
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500">
                          active
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </PageLayout>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
  loading,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: 'green' | 'blue';
  loading?: boolean;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <div className={cn(
          'p-1.5 rounded-md',
          accent === 'green' && 'bg-green-500/10 text-green-500',
          accent === 'blue' && 'bg-blue-500/10 text-blue-500',
          !accent && 'bg-muted text-muted-foreground',
        )}>
          {icon}
        </div>
      </div>
      {loading ? (
        <div className="h-8 w-16 bg-muted rounded animate-pulse" />
      ) : (
        <p className="text-2xl sm:text-3xl font-bold tracking-tight">{value}</p>
      )}
    </Card>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
