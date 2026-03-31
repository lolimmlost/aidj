import { Link } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { Button } from "./ui/button";

export function DefaultNotFound() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 pt-[calc(env(safe-area-inset-top)+4rem)]">
      <div className="flex flex-col items-center text-center space-y-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <SearchX className="h-10 w-10 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">404</h1>
          <p className="text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button type="button" onClick={() => window.history.back()}>
            Go Back
          </Button>
          <Button asChild variant="secondary">
            <Link to="/">Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
