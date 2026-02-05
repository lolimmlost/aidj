import { useState, Suspense, lazy } from 'react';
import { ChevronDown, ChevronUp, Compass } from 'lucide-react';
import { useDeferredRender } from '@/lib/utils/lazy-components';

const DiscoveryQueuePanel = lazy(() =>
  import('@/components/discovery/DiscoveryQueuePanel').then((m) => ({
    default: m.DiscoveryQueuePanel,
  })),
);

export function DiscoveryQueueSection() {
  const [collapsed, setCollapsed] = useState(false);
  const shouldRender = useDeferredRender(500);

  if (!shouldRender) return null;

  return (
    <section className="glass-card-premium p-5 sm:p-6 space-y-5">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-3 text-left group"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center">
          <Compass className="w-5 h-5 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <span className="bg-gradient-to-r from-emerald-500 to-cyan-500 bg-clip-text text-transparent">
              Discovery Queue
            </span>
            <span className="badge-success text-[10px]">Live</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Background music discovery
          </p>
        </div>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors ml-1" />
        ) : (
          <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors ml-1" />
        )}
      </button>

      {collapsed && (
        <p className="text-sm text-muted-foreground pl-[52px]">
          Tap to view your discovery queue
        </p>
      )}

      {!collapsed && (
        <Suspense fallback={null}>
          <DiscoveryQueuePanel />
        </Suspense>
      )}
    </section>
  );
}
