import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ThemeToggle } from "~/components/theme-toggle";
import { Music, Disc3, Radio, Sparkles, ArrowRight } from "lucide-react";

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
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 p-4 pb-16 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-primary/5" />
      <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />

      {/* Header */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Hero Section */}
      <div className="relative z-10 flex flex-col items-center gap-6 text-center max-w-2xl">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
            <Disc3 className="relative h-14 w-14 sm:h-16 sm:w-16 text-primary animate-spin-slow" />
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-gradient-brand">
            AIDJ
          </h1>
        </div>

        <p className="text-lg sm:text-xl text-muted-foreground max-w-md">
          AI-powered music discovery and smart playlists for your self-hosted library
        </p>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 w-full max-w-lg">
          <FeatureCard
            icon={<Music className="h-5 w-5" />}
            label="Smart Playlists"
          />
          <FeatureCard
            icon={<Sparkles className="h-5 w-5" />}
            label="AI Recommendations"
          />
          <FeatureCard
            icon={<Radio className="h-5 w-5" />}
            label="Discovery Mode"
          />
        </div>
      </div>

      {/* CTA */}
      <div className="relative z-10 flex flex-col items-center gap-4">
        <Link to="/login">
          <button className="action-button flex items-center gap-2 text-lg px-8 py-4">
            Get Started
            <ArrowRight className="h-5 w-5" />
          </button>
        </Link>
        <p className="text-sm text-muted-foreground">
          Connect your Navidrome library and start discovering
        </p>
      </div>

      {/* Footer */}
      <div className="relative z-10 mt-auto pt-8 text-center text-xs text-muted-foreground">
        <p>Powered by Navidrome, Last.fm, and local AI</p>
      </div>
    </div>
  );
}

function FeatureCard({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card/50 border border-border/50 backdrop-blur-sm hover:bg-card/80 hover:border-primary/30 transition-all">
      <div className="text-primary">{icon}</div>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
