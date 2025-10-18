import { Component, type ReactNode } from "react";
import { Button } from "./ui/button";
import { ServiceError } from "~/lib/utils";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }

      return <DefaultErrorFallback error={this.state.error} reset={this.reset} />;
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error;
  reset: () => void;
}

function DefaultErrorFallback({ error, reset }: ErrorFallbackProps) {
  const isServiceError = error instanceof ServiceError;

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-6 p-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold text-destructive">
          {isServiceError ? "Service Error" : "Something went wrong"}
        </h2>
        <p className="text-muted-foreground max-w-md">
          {isServiceError
            ? error.message
            : "An unexpected error occurred. Please try again."}
        </p>
        {isServiceError && error.code && (
          <p className="text-sm text-muted-foreground">
            Error Code: {error.code}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>
          Try Again
        </Button>
        <Button variant="outline" onClick={() => window.location.href = "/"}>
          Go Home
        </Button>
      </div>
    </div>
  );
}
