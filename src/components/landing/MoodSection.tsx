import { Coffee, Zap, PartyPopper, Brain, Sparkles, type LucideIcon } from 'lucide-react';

interface MoodCardData {
  name: string;
  subtitle: string;
  icon: LucideIcon;
  songCount: number;
  className: string;
}

const moods: MoodCardData[] = [
  { name: 'Chill', subtitle: 'Relax & unwind', icon: Coffee, songCount: 142, className: 'mood-card-chill' },
  { name: 'Energy', subtitle: 'Get moving', icon: Zap, songCount: 98, className: 'mood-card-energy' },
  { name: 'Party', subtitle: 'Dance all night', icon: PartyPopper, songCount: 127, className: 'mood-card-party' },
  { name: 'Focus', subtitle: 'Deep work mode', icon: Brain, songCount: 86, className: 'mood-card-focus' },
  { name: 'Discover', subtitle: 'Find new gems', icon: Sparkles, songCount: 215, className: 'mood-card-discover' },
];

export default function MoodSection() {
  return (
    <section className="relative py-24 sm:py-32 px-4 bg-card/30">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-b from-violet-500/10 to-transparent blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Set the <span className="text-gradient-brand">mood</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            Tap a mood to generate a playlist instantly
          </p>
        </div>

        {/* Horizontal scroll on mobile, grid on desktop */}
        <div className="flex lg:grid lg:grid-cols-5 gap-4 overflow-x-auto pb-4 lg:pb-0 snap-x snap-mandatory lg:snap-none -mx-4 px-4 lg:mx-0 lg:px-0 stagger-children">
          {moods.map((mood) => {
            const Icon = mood.icon;
            return (
              <div
                key={mood.name}
                className={`mood-card ${mood.className} flex-shrink-0 snap-center lg:flex-shrink`}
              >
                <Icon className="w-8 h-8 mb-3 drop-shadow-lg" />
                <h3 className="text-lg font-semibold">{mood.name}</h3>
                <p className="text-sm opacity-90">{mood.subtitle}</p>
                <p className="mt-3 text-xs opacity-75">{mood.songCount} songs</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
