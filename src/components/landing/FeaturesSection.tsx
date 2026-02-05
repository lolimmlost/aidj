import { Brain, Disc3, BarChart3, Layers, Sparkles, Shield, type LucideIcon } from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  colorClass: string;
}

const features: Feature[] = [
  {
    icon: Brain,
    title: 'AI DJ Engine',
    description:
      'Multi-provider LLM support with compound scoring. Play history, similarity, genre matching, and artist fatigue all factor into every recommendation.',
    colorClass: 'from-violet-500/20 to-pink-500/20 text-violet-500',
  },
  {
    icon: Disc3,
    title: 'Dual-Deck Crossfade',
    description:
      'Gapless transitions between tracks with a real crossfade engine. 10 built-in audio visualizers from bars to particle starfields.',
    colorClass: 'from-cyan-500/20 to-violet-500/20 text-cyan-500',
  },
  {
    icon: BarChart3,
    title: 'Music Identity',
    description:
      'Spotify Wrapped-style analytics on demand. Listening patterns, mood profiles, decade breakdowns, and shareable identity cards.',
    colorClass: 'from-pink-500/20 to-violet-500/20 text-pink-500',
  },
  {
    icon: Layers,
    title: 'Smart Playlists',
    description:
      'Rule-based smart playlists, drag-and-drop editing, collaborative playlists with real-time suggestions, and Navidrome two-way sync.',
    colorClass: 'from-emerald-500/20 to-cyan-500/20 text-emerald-500',
  },
  {
    icon: Sparkles,
    title: 'Discovery Feed',
    description:
      'Background discovery finds new music while you listen. Accept, skip, or save — the engine learns your taste with every interaction.',
    colorClass: 'from-amber-500/20 to-pink-500/20 text-amber-500',
  },
  {
    icon: Shield,
    title: 'Self-Hosted & Private',
    description:
      'Your Navidrome library, your PostgreSQL database, your local AI. No data leaves your network unless you choose to connect Last.fm.',
    colorClass: 'from-violet-500/20 to-cyan-500/20 text-violet-500',
  },
];

export default function FeaturesSection() {
  return (
    <section className="relative py-24 sm:py-32 px-4 bg-background">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-card/20 to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            A complete music platform, not just a player
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Everything your music{' '}
            <span className="text-gradient-brand">deserves</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="interactive-card group">
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.colorClass} flex items-center justify-center mb-4`}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold mb-2 tracking-tight">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
