import { createFileRoute, redirect } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ListTodo, Play, Square, RefreshCw, Clock, AlertCircle, CheckCircle2, Loader2, Sparkles, Library, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageLayout, PageSection } from '@/components/ui/page-layout';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { UnifiedTask } from '@/lib/services/task-aggregator';

export const Route = createFileRoute('/tasks/')(
  {
    beforeLoad: async ({ context }) => {
      if (!context.user) {
        throw redirect({ to: '/login' });
      }
    },
    component: TasksPage,
  }
);

function TasksPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await fetch('/api/tasks');
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const json = await res.json();
      return json.data.tasks as UnifiedTask[];
    },
    refetchInterval: (query) => {
      const tasks = query.state.data;
      const hasRunning = tasks?.some(t => t.status === 'running');
      return hasRunning ? 5000 : 30000;
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ taskId, action }: { taskId: string; action: 'trigger' | 'cancel' }) => {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, action }),
      });
      if (!res.ok) throw new Error('Failed to perform action');
      return res.json();
    },
    onSuccess: (_, { taskId, action }) => {
      toast.success(action === 'trigger' ? 'Task started' : 'Task cancelled');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: () => {
      toast.error('Failed to perform action');
    },
  });

  const tasks = data ?? [];

  return (
    <PageLayout
      title="Tasks"
      description="Monitor and manage background tasks"
      icon={<ListTodo className="h-5 w-5" />}
      backLink="/dashboard"
      backLabel="Dashboard"
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['tasks'] })}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      }
    >
      <PageSection>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Card key={i} className="p-6 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-muted" />
                  <div className="h-5 w-32 rounded bg-muted" />
                </div>
                <div className="h-4 w-full rounded bg-muted mb-2" />
                <div className="h-2 w-full rounded-full bg-muted" />
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card className="p-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
            <p className="text-muted-foreground">Failed to load task statuses</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onTrigger={() => actionMutation.mutate({ taskId: task.id, action: 'trigger' })}
                onCancel={() => actionMutation.mutate({ taskId: task.id, action: 'cancel' })}
                isActioning={actionMutation.isPending}
              />
            ))}
          </div>
        )}
      </PageSection>
    </PageLayout>
  );
}

const TASK_ICONS: Record<string, React.ReactNode> = {
  'library-sync': <Library className="h-5 w-5" />,
  'discovery': <Sparkles className="h-5 w-5" />,
  'lastfm-backfill': <Radio className="h-5 w-5" />,
};

const STATUS_CONFIG = {
  idle: { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Idle' },
  running: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Running' },
  completed: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Completed' },
  error: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Error' },
};

function TaskCard({
  task,
  onTrigger,
  onCancel,
  isActioning,
}: {
  task: UnifiedTask;
  onTrigger: () => void;
  onCancel: () => void;
  isActioning: boolean;
}) {
  const config = STATUS_CONFIG[task.status];
  const StatusIcon = config.icon;

  return (
    <Card className="p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', config.bg, config.color)}>
            {TASK_ICONS[task.type] || <ListTodo className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="font-semibold text-sm">{task.name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <StatusIcon className={cn('h-3.5 w-3.5', config.color, task.status === 'running' && 'animate-spin')} />
              <span className={cn('text-xs font-medium', config.color)}>{config.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground leading-relaxed">{task.description}</p>

      {/* Progress bar */}
      {task.progress && task.status === 'running' && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{task.progress.message}</span>
            <span>{task.progress.percentage}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(2, task.progress.percentage)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {task.progress.current.toLocaleString()} / {task.progress.total.toLocaleString()}
          </p>
        </div>
      )}

      {/* Error message */}
      {task.error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {task.error}
        </p>
      )}

      {/* Stats */}
      {task.stats && Object.keys(task.stats).length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {Object.entries(task.stats).map(([key, value]) => (
            <div key={key} className="text-xs">
              <span className="text-muted-foreground">{formatStatKey(key)}: </span>
              <span className="font-medium">{value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Timestamps */}
      <div className="text-xs text-muted-foreground space-y-0.5">
        {task.lastRunAt && (
          <p>Last run: {formatRelativeTime(task.lastRunAt)}</p>
        )}
        {task.nextRunAt && task.status !== 'running' && (
          <p>Next run: {formatRelativeTime(task.nextRunAt)}</p>
        )}
      </div>

      {/* Actions */}
      {(task.canTrigger || task.canCancel) && (
        <div className="flex gap-2 mt-auto pt-2 border-t">
          {task.canTrigger && (
            <Button
              variant="outline"
              size="sm"
              onClick={onTrigger}
              disabled={isActioning}
              className="flex-1"
            >
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Run Now
            </Button>
          )}
          {task.canCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isActioning}
              className="flex-1 text-destructive hover:text-destructive"
            >
              <Square className="h-3.5 w-3.5 mr-1.5" />
              Cancel
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function formatStatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const absDiffMs = Math.abs(diffMs);
  const isFuture = diffMs < 0;

  if (absDiffMs < 60_000) return isFuture ? 'in less than a minute' : 'just now';
  if (absDiffMs < 3600_000) {
    const mins = Math.round(absDiffMs / 60_000);
    return isFuture ? `in ${mins}m` : `${mins}m ago`;
  }
  if (absDiffMs < 86400_000) {
    const hours = Math.round(absDiffMs / 3600_000);
    return isFuture ? `in ${hours}h` : `${hours}h ago`;
  }
  const days = Math.round(absDiffMs / 86400_000);
  return isFuture ? `in ${days}d` : `${days}d ago`;
}
