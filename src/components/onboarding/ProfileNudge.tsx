import { useState } from 'react';
import { X, UserCircle } from 'lucide-react';

const DISMISS_KEY = 'aidj-profile-nudge-dismissed';

interface ProfileNudgeProps {
  onStartWizard: () => void;
}

export function ProfileNudge({ onStartWizard }: ProfileNudgeProps) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // localStorage unavailable
    }
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 relative">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <UserCircle className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm">Complete your profile</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tell us your music taste for better recommendations
          </p>
        </div>
        <button
          onClick={onStartWizard}
          className="text-sm font-medium text-primary hover:text-primary/80 transition-colors shrink-0"
        >
          Set up
        </button>
      </div>
    </div>
  );
}
