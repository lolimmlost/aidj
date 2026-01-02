import { Link } from '@tanstack/react-router';
import { Disc3, ListMusic, Bot, SlidersHorizontal, Plus, Sparkles, Settings } from 'lucide-react';

/**
 * DJ Features section showcasing available DJ tools
 */
export function DJFeatures() {
  return (
    <section className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg">
            <Disc3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              DJ Features
            </h2>
            <p className="text-xs text-muted-foreground">
              Professional-grade mixing tools
            </p>
          </div>
        </div>
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
          Pro
        </span>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* DJ Settings - Quick Access */}
        <Link to="/dj/settings" className="group md:col-span-2">
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600/10 via-indigo-600/5 to-purple-600/10 border-2 border-blue-500/20 hover:border-blue-500/40 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-0.5 p-5 sm:p-6">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-full blur-2xl -z-10" />

            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="flex-shrink-0 p-3 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl shadow-lg group-hover:scale-105 transition-transform">
                <Settings className="h-6 w-6 text-white" />
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xl font-bold">DJ Settings</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-blue-400 to-indigo-500 text-white">
                    Quick Access
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Configure AI DJ mode and audio transitions for the perfect mix
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CheckIcon /> Crossfade & Transitions
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckIcon /> AI DJ Controls
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckIcon /> Smart Timing
                  </span>
                </div>
              </div>

              <ArrowIcon className="hidden sm:block text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </div>
          </div>
        </Link>

        {/* DJ Mixer - Featured */}
        <Link to="/dj/mixer" className="group md:col-span-2">
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600/10 via-purple-600/5 to-pink-600/10 border-2 border-blue-500/20 hover:border-blue-500/40 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-0.5 p-5 sm:p-6">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-2xl -z-10" />

            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="flex-shrink-0 p-3 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl shadow-lg group-hover:scale-105 transition-transform">
                <Disc3 className="h-6 w-6 text-white" />
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xl font-bold">DJ Mixer</h3>
                  <span className="badge-info">NEW</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-yellow-400 to-orange-500 text-white">
                    Pro
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Professional DJ mixing interface with dual decks, crossfader, and beat-matching
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CheckIcon /> Dual Decks
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckIcon /> Live Waveforms
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckIcon /> Effects
                  </span>
                </div>
              </div>

              <ArrowIcon className="hidden sm:block text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </div>
          </div>
        </Link>

        {/* Queue Manager */}
        <FeatureLink
          to="/dj/queue"
          icon={<ListMusic className="h-5 w-5" />}
          title="Queue Manager"
          description="Smart queue management with auto-mixing and AI recommendations"
          color="green"
          badge="Auto"
        />

        {/* AI DJ Assistant */}
        <FeatureLink
          to="/dj/ai-assistant"
          icon={<Bot className="h-5 w-5" />}
          title="AI DJ Assistant"
          description="AI-powered assistant that creates intelligent, seamless mixes"
          color="purple"
          badges={['AI', 'BETA']}
        />

        {/* DJ Controls */}
        <FeatureLink
          to="/dj/controls"
          icon={<SlidersHorizontal className="h-5 w-5" />}
          title="DJ Controls"
          description="Essential DJ controls for playback, crossfading, and session management"
          color="orange"
        />

        {/* More Tools */}
        <Link to="/dj" className="group">
          <div className="h-full p-4 rounded-xl bg-gradient-to-br from-muted/50 to-muted/30 border-2 border-dashed border-muted-foreground/20 hover:border-muted-foreground/40 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 flex items-center justify-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Plus className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">More DJ Tools</h3>
                <p className="text-xs text-muted-foreground">Explore additional features</p>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* Pro Tip */}
      <div className="p-4 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5 border border-blue-500/10 rounded-xl">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg flex-shrink-0">
            <Sparkles className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h3 className="font-medium text-sm mb-0.5">Pro Tip</h3>
            <p className="text-xs text-muted-foreground">
              Start with <span className="font-medium text-foreground">DJ Mixer</span> for the complete mixing experience. All tools integrate seamlessly with your music library.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

interface FeatureLinkProps {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: 'green' | 'purple' | 'orange';
  badge?: string;
  badges?: string[];
}

function FeatureLink({ to, icon, title, description, color, badge, badges }: FeatureLinkProps) {
  const colorClasses = {
    green: 'from-green-500/10 to-emerald-600/5 border-green-500/20 hover:border-green-500/40 hover:shadow-green-500/10',
    purple: 'from-purple-500/10 to-pink-600/5 border-purple-500/20 hover:border-purple-500/40 hover:shadow-purple-500/10',
    orange: 'from-orange-500/10 to-red-600/5 border-orange-500/20 hover:border-orange-500/40 hover:shadow-orange-500/10',
  };

  const iconClasses = {
    green: 'from-green-600 to-emerald-600',
    purple: 'from-purple-600 to-pink-600',
    orange: 'from-orange-600 to-red-600',
  };

  const badgeClasses = {
    green: 'badge-success',
    purple: 'badge-purple',
    orange: 'badge-warning',
  };

  const allBadges = badges || (badge ? [badge] : []);

  return (
    <Link to={to} className="group">
      <div className={`h-full p-5 rounded-xl bg-gradient-to-br border-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${colorClasses[color]}`}>
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2.5 bg-gradient-to-br rounded-xl shadow-md group-hover:scale-105 transition-transform ${iconClasses[color]}`}>
            <div className="text-white">{icon}</div>
          </div>
          {allBadges.length > 0 && (
            <div className="flex gap-1.5">
              {allBadges.map((b) => (
                <span key={b} className={badgeClasses[color]}>{b}</span>
              ))}
            </div>
          )}
        </div>
        <h3 className="font-bold text-base mb-1">{title}</h3>
        <p className="text-xs text-muted-foreground mb-3">{description}</p>
        <div className="flex items-center text-xs text-muted-foreground">
          <ArrowIcon className="h-3 w-3 mr-1" />
          Explore feature
        </div>
      </div>
    </Link>
  );
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function ArrowIcon({ className = '' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14"/>
      <path d="m12 5 7 7-7 7"/>
    </svg>
  );
}
