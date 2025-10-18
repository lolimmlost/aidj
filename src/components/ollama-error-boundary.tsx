import { type ReactNode } from "react";
import { ErrorBoundary } from "./error-boundary";
import { Button } from "./ui/button";
import { ServiceError } from "~/lib/utils";

interface OllamaErrorBoundaryProps {
  children: ReactNode;
}

export function OllamaErrorBoundary({ children }: OllamaErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <OllamaErrorFallback error={error} reset={reset} />
      )}
      onError={(error) => {
        console.error("Ollama Error:", error);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

interface OllamaErrorFallbackProps {
  error: Error;
  reset: () => void;
}

function OllamaErrorFallback({ error, reset }: OllamaErrorFallbackProps) {
  const isServiceError = error instanceof ServiceError;

  // Determine user-friendly message based on error
  let title = "AI Service Unavailable";
  let message = "Unable to connect to the AI recommendation service.";
  let actionText = "Check that Ollama is running and try again.";

  if (isServiceError) {
    switch (error.code) {
      case "OLLAMA_TIMEOUT":
        title = "Request Timed Out";
        message = "The AI service took too long to respond.";
        actionText = "Try again with a simpler prompt or different style.";
        break;
      case "OLLAMA_NOT_AVAILABLE":
        title = "AI Service Not Running";
        message = "Cannot connect to Ollama service.";
        actionText = "Please start Ollama and try again.";
        break;
      case "OLLAMA_MODEL_NOT_FOUND":
        title = "AI Model Not Found";
        message = "The required AI model is not available.";
        actionText = "Please pull the required model in Ollama.";
        break;
      default:
        message = error.message;
    }
  }

  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-6 p-6 border rounded-lg bg-muted/50">
      <div className="text-center space-y-3 max-w-md">
        <div className="text-5xl mb-2">🤖</div>
        <h3 className="text-xl font-semibold text-destructive">{title}</h3>
        <p className="text-muted-foreground">{message}</p>
        <p className="text-sm text-muted-foreground">{actionText}</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={reset} variant="default">
          Try Again
        </Button>
        <Button variant="outline" onClick={() => window.location.href = "/library"}>
          Browse Library Instead
        </Button>
      </div>
    </div>
  );
}
