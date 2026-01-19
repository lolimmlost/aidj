import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Disc, ListMusic, Sparkles, Settings } from "lucide-react";

export const Route = createFileRoute("/dj/")({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: DJIndex,
});

function DJIndex() {
  return (
    <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        {/* Hidden on mobile since hamburger menu provides navigation */}
        <Link to="/dashboard" className="hidden md:block shrink-0">
          <Button variant="outline" size="sm" className="min-h-[44px] w-full sm:w-auto">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Disc className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold">DJ Tools</h1>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* DJ Settings */}
        <Link to="/dj/settings">
          <Card className="h-full cursor-pointer hover:bg-muted/50 transition-colors border-primary/50 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                DJ Settings
              </CardTitle>
              <CardDescription>
                Configure AI DJ and audio transitions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>- AI DJ queue threshold & batch size</li>
                <li>- Crossfade, silence, or reverb transitions</li>
                <li>- Smart AI-optimized transition timing</li>
                <li>- Autoplay when playlist ends</li>
              </ul>
            </CardContent>
          </Card>
        </Link>

        {/* Set Builder */}
        <Link to="/dj/set-builder">
          <Card className="h-full cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListMusic className="h-5 w-5 text-primary" />
                Set Builder
              </CardTitle>
              <CardDescription>
                Create professional DJ sets with energy curves and BPM progression
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>- Choose from set templates (Club Night, Warm-up, Peak Time)</li>
                <li>- Customize duration, energy profile, BPM range</li>
                <li>- Export to Navidrome playlist</li>
                <li>- Save and manage set history</li>
              </ul>
            </CardContent>
          </Card>
        </Link>

        {/* AI DJ Info Card */}
        <Card className="h-full bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI DJ Mode
            </CardTitle>
            <CardDescription>
              Enable from the dashboard or queue panel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              AI DJ automatically queues similar songs based on what you're playing.
              Toggle it on from the dashboard's "Now Playing" section or use the
              queue panel's AI DJ switch.
            </p>
            <div className="mt-4">
              <Link to="/dashboard">
                <Button variant="outline" size="sm">
                  Go to Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pro Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pro Tips</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p><strong>DJ Settings:</strong> Configure crossfade, reverb tail, or silence transitions in DJ Settings for smooth mixes.</p>
          <p><strong>Smart Transitions:</strong> Enable AI-optimized transitions to automatically adjust timing based on song compatibility.</p>
          <p><strong>Harmonic Mixing:</strong> Look for the BPM and key badges on recommendations to find compatible tracks.</p>
          <p><strong>Queue Management:</strong> Use the queue panel to reorder, remove, or shuffle upcoming songs.</p>
        </CardContent>
      </Card>
    </div>
  );
}
