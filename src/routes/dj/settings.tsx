import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Waves } from "lucide-react";
import { AutoplaySettings } from "@/components/autoplay-settings";
import { AIDJSettings } from "@/components/ai-dj-settings";
import { PageLayout } from "@/components/ui/page-layout";

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
    <PageLayout
      title="DJ Settings"
      description="Configure AI DJ and audio transitions"
      icon={<Waves className="h-5 w-5" />}
      backLink="/dj"
      backLabel="DJ Tools"
    >
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

      {/* Two-column layout: settings left, help right on desktop */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Settings Sections - Main Column */}
        <div className="flex-1 lg:w-[60%] space-y-6">
          {/* AI DJ Configuration */}
          <AIDJSettings />

          {/* Autoplay & Transitions */}
          <AutoplaySettings />
        </div>

        {/* Help Sidebar - Right Column on Desktop */}
        <div className="lg:w-[40%] lg:max-w-sm">
          <div className="lg:sticky lg:top-6 space-y-4">
            <Card className="p-4 bg-muted/50">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                How These Settings Work Together
              </h3>
              <div className="text-sm text-muted-foreground space-y-3">
                <div>
                  <p className="font-medium text-foreground mb-1">AI DJ Mode</p>
                  <p>Automatically adds songs to your queue based on what you're currently playing. Configure when and how many songs get added.</p>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">Autoplay Transitions</p>
                  <p>When your playlist ends, Autoplay kicks in with smart transitions between songs. Choose from crossfade, silence, or reverb tail effects.</p>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">Smart Transitions</p>
                  <p>When enabled, AI analyzes song compatibility and energy flow to optimize transition timing for the smoothest listening experience.</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
