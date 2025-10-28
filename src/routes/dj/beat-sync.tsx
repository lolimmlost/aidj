import { createFileRoute, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/dj/beat-sync")({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: BeatSyncPage,
});

function BeatSyncPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/dj">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to DJ Features
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Beat Synchronizer</h1>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6">
        <div className="text-center p-8 bg-muted/50 rounded-lg">
          <div className="mb-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="10 8 16 12 14 8"/>
              </svg>
            </div>
            <h3 className="text-xl font-semibold">Beat Synchronizer</h3>
            <p className="text-muted-foreground">Coming Soon</p>
          </div>
          <p className="text-muted-foreground max-w-md">
            Advanced beat matching and phase alignment for seamless transitions. 
            This feature will analyze beat patterns and align tracks for perfect synchronization.
          </p>
        </div>
      </div>
    </div>
  );
}