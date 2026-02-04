import { createFileRoute, redirect } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ListTodo, Play, Square, RefreshCw, AlertCircle, Loader2, Sparkles, Library, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageLayout, PageSection } from '@/components/ui/page-layout';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

const TASK_ICONS: Record<string, React.ReactNode> = {
  'library-sync': <Library className="h-4 w-4" />,
  'discovery': <Sparkles className="h-4 w-4" />,
  'lastfm-backfill': <Radio className="h-4 w-4" />,
};

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
    onSuccess: (_, { action }) => {
      toast.success(action === 'trigger' ? 'Task started' : 'Task cancelled');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: () => {
      toast.error('Failed to perform action');
    },
  });

  const tasks = data ?? [];
  const activeTasks = tasks.filter(t => t.status === 'running');

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
      {/* Scheduled Tasks Table */}
      <PageSection title="Scheduled">
        {isLoading ? (
          <Card className="p-0 overflow-hidden">
            <div className="animate-pulse space-y-0">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-b-0">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="h-4 w-20 rounded bg-muted" />
                  <div className="h-4 w-16 rounded bg-muted" />
                  <div className="h-4 w-12 rounded bg-muted" />
                  <div className="h-4 w-16 rounded bg-muted" />
                </div>
              ))}
            </div>
          </Card>
        ) : error ? (
          <Card className="p-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
            <p className="text-muted-foreground">Failed to load task statuses</p>
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Interval</TableHead>
                  <TableHead className="hidden sm:table-cell">Last Execution</TableHead>
                  <TableHead className="hidden md:table-cell">Last Duration</TableHead>
                  <TableHead className="hidden sm:table-cell">Next Execution</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map(task => (
                  <ScheduledTaskRow
                    key={task.id}
                    task={task}
                    onTrigger={() => actionMutation.mutate({ taskId: task.id, action: 'trigger' })}
                    isActioning={actionMutation.isPending}
                  />
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </PageSection>

      {/* Active Tasks */}
      <PageSection title="Active">
        {activeTasks.length > 0 ? (
          <div className="space-y-3">
            {activeTasks.map(task => (
              <ActiveTaskCard
                key={task.id}
                task={task}
                onCancel={() => actionMutation.mutate({ taskId: task.id, action: 'cancel' })}
                isActioning={actionMutation.isPending}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4">No tasks are currently running</p>
        )}
      </PageSection>
    </PageLayout>
  );
}

function ScheduledTaskRow({
  task,
  onTrigger,
  isActioning,
}: {
  task: UnifiedTask;
  onTrigger: () => void;
  isActioning: boolean;
}) {
  const isRunning = task.status === 'running';
  const isError = task.status === 'error';

  return (
    <TableRow>
      <TableCell className="pl-4">
        <div className="flex items-center gap-2.5">
          <span className={cn(
            'flex-shrink-0',
            isError ? 'text-destructive' : 'text-muted-foreground',
          )}>
            {TASK_ICONS[task.type] || <ListTodo className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <span className="font-medium text-sm">{task.name}</span>
            {isError && task.error && (
              <p className="text-xs text-destructive truncate">{task.error}</p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
        {task.interval ?? '\u2014'}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm whitespace-nowrap hidden sm:table-cell">
        {task.lastRunAt ? formatRelativeTime(task.lastRunAt) : '\u2014'}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm whitespace-nowrap hidden md:table-cell">
        {task.lastDuration ?? '\u2014'}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm whitespace-nowrap hidden sm:table-cell">
        {isRunning ? (
          <span className="text-blue-500 flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Running
          </span>
        ) : task.nextRunAt ? (
          formatRelativeTime(task.nextRunAt)
        ) : '\u2014'}
      </TableCell>
      <TableCell className="pr-4 text-right">
        {task.canTrigger && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onTrigger}
            disabled={isActioning}
            title="Run now"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function ActiveTaskCard({
  task,
  onCancel,
  isActioning,
}: {
  task: UnifiedTask;
  onCancel: () => void;
  isActioning: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500 flex-shrink-0" />
          <span className="font-medium text-sm truncate">{task.name}</span>
        </div>
        {task.canCancel && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isActioning}
            className="flex-shrink-0 text-destructive hover:text-destructive"
          >
            <Square className="h-3.5 w-3.5 mr-1.5" />
            Cancel
          </Button>
        )}
      </div>

      {task.progress && (
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
    </Card>
  );
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
