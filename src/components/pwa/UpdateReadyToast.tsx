import { RefreshCw, Sparkles } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAudioStore } from '@/lib/stores/audio';

export const UPDATE_TOAST_ID = 'sw-update-ready';

interface UpdateReadyCardProps {
  onReload: () => void;
  onLater: () => void;
}

/**
 * AIDJ-styled "new version ready" card (#294). Persistent until the user
 * chooses: Reload applies the waiting service worker now; Later leaves it to
 * apply on the next cold launch. No countdown — it doesn't expire.
 */
export function UpdateReadyCard({ onReload, onLater }: UpdateReadyCardProps) {
  const isPlaying = useAudioStore((s) => s.isPlaying);

  return (
    <div
      role="status"
      className="relative w-full overflow-hidden rounded-2xl border border-primary/25 bg-popover/90 p-4 text-popover-foreground shadow-xl shadow-primary/10 backdrop-blur-xl"
    >
      {/* Accent wash, echoing the dashboard hero */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-fuchsia-500/10"
      />
      <div className="relative flex items-start gap-3">
        <div className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 text-white shadow-lg shadow-primary/30">
          <span aria-hidden="true" className="absolute inset-0 rounded-xl bg-primary/40 motion-safe:animate-ping [animation-duration:2.4s]" />
          <Sparkles className="relative h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">New version ready</p>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {isPlaying
              ? 'Reloading pauses your music. Or keep listening — it updates next time you open AIDJ.'
              : 'Reload to update now, or it applies next time you open AIDJ.'}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onReload}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/30 transition-transform hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reload
            </button>
            <button
              type="button"
              onClick={onLater}
              className="inline-flex h-8 items-center rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Show (or keep showing) the update card; `onReload` applies the update. */
export function showUpdateReadyToast(onReload: () => void) {
  toast.custom(
    (id) => (
      <UpdateReadyCard
        onReload={onReload}
        onLater={() => toast.dismiss(id)}
      />
    ),
    {
      id: UPDATE_TOAST_ID,
      duration: Infinity,
      // The card brings its own surface; drop the generic toast chrome.
      className: '!border-0 !bg-transparent !p-0 !shadow-none',
    },
  );
}
