import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Music, Waves } from "lucide-react";
import { AutoplaySettings } from "@/components/autoplay-settings";
import { AIDJSettings } from "@/components/ai-dj-settings";

export const Route = createFileRoute("/dj/settings")({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: DJSettingsPage,
});

function DJSettingsPage() {
  return (
    <div className="container mx-auto p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          {/* Hidden on mobile since hamburger menu provides navigation */}
          <div className="hidden md:flex items-center gap-4">
            <Link to="/dj">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to DJ Tools
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <Music className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">DJ Settings</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Configure your DJ experience with advanced audio transitions and AI features
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <Card className="p-4 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <div className="flex items-center gap-2 text-sm">
          <Waves className="h-4 w-4 text-primary" />
          <span className="font-medium">Quick Access:</span>
          <Link to="/dashboard">
            <Button variant="link" size="sm" className="h-auto p-0">
              Dashboard
            </Button>
          </Link>
          <span className="text-muted-foreground">•</span>
          <Link to="/dj/set-builder">
            <Button variant="link" size="sm" className="h-auto p-0">
              Set Builder
            </Button>
          </Link>
          <span className="text-muted-foreground">•</span>
          <Link to="/settings">
            <Button variant="link" size="sm" className="h-auto p-0">
              Main Settings
            </Button>
          </Link>
        </div>
      </Card>

      {/* Settings Sections */}
      <div className="space-y-6">
        {/* AI DJ Configuration */}
        <AIDJSettings />

        {/* Autoplay & Transitions */}
        <AutoplaySettings />
      </div>

      {/* Help Text */}
      <Card className="p-4 bg-muted/50">
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          💡 How These Settings Work Together
        </h3>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>AI DJ Mode:</strong> Automatically adds songs to your queue based on what you're currently playing.
            Configure when and how many songs get added.
          </p>
          <p>
            <strong>Autoplay Transitions:</strong> When your playlist ends, Autoplay kicks in with smart transitions
            between songs. Choose from crossfade, silence, or reverb tail effects.
          </p>
          <p>
            <strong>Smart Transitions:</strong> When enabled, AI analyzes song compatibility and energy flow to
            optimize transition timing for the smoothest listening experience.
          </p>
        </div>
      </Card>
    </div>
  );
}
