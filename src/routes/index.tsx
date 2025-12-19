import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ThemeToggle } from "~/components/theme-toggle";
import { Button } from "~/components/ui/button";
import { Music, Disc3, Radio, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Home,
  beforeLoad: async ({ context }) => {
    // If user is logged in, redirect to dashboard
    if (context.user) {
      throw redirect({ to: '/dashboard' });
    }
  },
});

function Home() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 p-4 bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      {/* Hero Section */}
      <div className="flex flex-col items-center gap-6 text-center max-w-2xl">
        <div className="flex items-center gap-3">
          <Disc3 className="h-12 w-12 text-primary animate-spin-slow" />
          <h1 className="text-4xl font-bold sm:text-5xl bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            AI DJ
          </h1>
        </div>

        <p className="text-xl text-muted-foreground">
          Your intelligent music companion powered by AI recommendations
        </p>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 w-full max-w-lg">
          <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-card border">
            <Music className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">Smart Playlists</span>
          </div>
          <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-card border">
            <Sparkles className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">AI Recommendations</span>
          </div>
          <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-card border">
            <Radio className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">Discovery Mode</span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-4">
        <Button type="button" asChild size="lg" className="text-lg px-8">
          <Link to="/login">Get Started</Link>
        </Button>
        <p className="text-sm text-muted-foreground">
          Connect your Navidrome library and start discovering
        </p>
      </div>

      {/* Footer */}
      <div className="absolute bottom-4 text-center text-xs text-muted-foreground">
        <p>Powered by Navidrome, Last.fm, and AI</p>
      </div>
    </div>
  );
}
