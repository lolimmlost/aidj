import { type ReactNode } from "react";
import { ErrorBoundary } from "./error-boundary";
import { Button } from "./ui/button";
import { ServiceError } from "~/lib/utils";

interface NavidromeErrorBoundaryProps {
  children: ReactNode;
}

export function NavidromeErrorBoundary({ children }: NavidromeErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <NavidromeErrorFallback error={error} reset={reset} />
      )}
      onError={(error) => {
        console.error("Navidrome Error:", error);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

interface NavidromeErrorFallbackProps {
  error: Error;
  reset: () => void;
}

function NavidromeErrorFallback({ error, reset }: NavidromeErrorFallbackProps) {
  const isServiceError = error instanceof ServiceError;

  // Determine user-friendly message based on error
  let title = "Music Library Unavailable";
  let message = "Unable to connect to your music library.";
  let actionText = "Check that Navidrome is running and try again.";

  if (isServiceError) {
    switch (error.code) {
      case "NAVIDROME_AUTH_FAILED":
        title = "Authentication Failed";
        message = "Your session may have expired.";
        actionText = "Please sign in again.";
        break;
      case "NAVIDROME_NOT_AVAILABLE":
        title = "Music Server Not Running";
        message = "Cannot connect to Navidrome service.";
        actionText = "Please start Navidrome and try again.";
        break;
      case "NAVIDROME_NOT_FOUND":
        title = "Content Not Found";
        message = "The requested music content could not be found.";
        actionText = "Try browsing your library instead.";
        break;
      default:
        message = error.message;
    }
  }

  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-6 p-6 border rounded-lg bg-muted/50">
      <div className="text-center space-y-3 max-w-md">
        <div className="text-5xl mb-2">🎵</div>
        <h3 className="text-xl font-semibold text-destructive">{title}</h3>
        <p className="text-muted-foreground">{message}</p>
        <p className="text-sm text-muted-foreground">{actionText}</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={reset} variant="default">
          Try Again
        </Button>
        <Button variant="outline" onClick={() => window.location.href = "/config"}>
          Check Settings
        </Button>
      </div>
    </div>
  );
}
