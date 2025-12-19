import { Link } from '@tanstack/react-router';
import { Search, Users, ListMusic, Settings } from 'lucide-react';

interface DashboardHeroProps {
  userName?: string;
  availableRecommendations: number;
  playlistSongsReady: number;
}

/**
 * Dashboard hero section with greeting and quick stats
 */
export function DashboardHero({
  userName,
  availableRecommendations,
  playlistSongsReady,
}: DashboardHeroProps) {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <section className="space-y-4">
      {/* Hero Banner - Compact on mobile */}
      <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20 p-4 sm:p-6 lg:p-8">
        <div className="absolute top-0 right-0 w-60 h-60 bg-primary/5 rounded-full blur-3xl -z-10" />
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-4 mb-3 sm:mb-4">
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-foreground">
                {getGreeting()}, {userName || 'Music Lover'}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 hidden sm:block">
                AI-powered music discovery and intelligent playlists
              </p>
            </div>
            {/* Quick Stats - Inline on mobile */}
            <div className="flex gap-2 sm:hidden">
              <div className="bg-background/60 rounded-lg px-2 py-1 border border-border/50 text-center">
                <div className="text-sm font-bold text-primary">{availableRecommendations}</div>
                <div className="text-[10px] text-muted-foreground">Recs</div>
              </div>
            </div>
          </div>

          {/* Quick Stats - Grid on larger screens */}
          <div className="hidden sm:grid grid-cols-4 gap-2 sm:gap-3">
            <StatBadge
              value={availableRecommendations}
              label="Recommendations"
              color="primary"
            />
            <StatBadge
              value={playlistSongsReady}
              label="Playlist Songs"
              color="green"
            />
            <StatBadge
              value="AI"
              label="Powered"
              color="blue"
            />
            <StatBadge
              value="DJ"
              label="Tools"
              color="purple"
            />
          </div>
        </div>
      </div>

      {/* Quick Actions - Hidden on mobile to reduce scroll */}
      <div className="hidden sm:grid sm:grid-cols-4 gap-3">
        <QuickAction
          to="/library/search"
          icon={<Search className="h-5 w-5" />}
          title="Search Library"
          description="Find songs instantly"
          color="blue"
        />
        <QuickAction
          to="/library/artists"
          icon={<Users className="h-5 w-5" />}
          title="Browse Artists"
          description="Explore your collection"
          color="purple"
        />
        <QuickAction
          to="/playlists"
          icon={<ListMusic className="h-5 w-5" />}
          title="My Playlists"
          description="Manage collections"
          color="green"
        />
        <QuickAction
          to="/settings"
          icon={<Settings className="h-5 w-5" />}
          title="Settings"
          description="Customize experience"
          color="orange"
        />
      </div>
    </section>
  );
}

interface StatBadgeProps {
  value: string | number;
  label: string;
  color: 'primary' | 'green' | 'blue' | 'purple';
}

function StatBadge({ value, label, color }: StatBadgeProps) {
  const colorClasses = {
    primary: 'text-primary',
    green: 'text-green-600',
    blue: 'text-blue-600',
    purple: 'text-purple-600',
  };

  return (
    <div className="bg-background/60 backdrop-blur-sm rounded-lg p-3 border border-border/50">
      <div className={`text-xl font-bold ${colorClasses[color]}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

interface QuickActionProps {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: 'blue' | 'purple' | 'green' | 'orange';
}

function QuickAction({ to, icon, title, description, color }: QuickActionProps) {
  const colorClasses = {
    blue: 'from-blue-500/10 to-blue-600/5 border-blue-500/20 hover:border-blue-500/40 hover:shadow-blue-500/10',
    purple: 'from-purple-500/10 to-purple-600/5 border-purple-500/20 hover:border-purple-500/40 hover:shadow-purple-500/10',
    green: 'from-green-500/10 to-green-600/5 border-green-500/20 hover:border-green-500/40 hover:shadow-green-500/10',
    orange: 'from-orange-500/10 to-orange-600/5 border-orange-500/20 hover:border-orange-500/40 hover:shadow-orange-500/10',
  };

  const iconColorClasses = {
    blue: 'bg-blue-500/10 text-blue-600 group-hover:bg-blue-500/20',
    purple: 'bg-purple-500/10 text-purple-600 group-hover:bg-purple-500/20',
    green: 'bg-green-500/10 text-green-600 group-hover:bg-green-500/20',
    orange: 'bg-orange-500/10 text-orange-600 group-hover:bg-orange-500/20',
  };

  return (
    <Link to={to} className="group">
      <div className={`h-full p-4 sm:p-5 rounded-xl bg-gradient-to-br border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${colorClasses[color]}`}>
        <div className={`inline-flex p-2.5 rounded-lg mb-3 transition-colors ${iconColorClasses[color]}`}>
          {icon}
        </div>
        <h3 className="font-semibold text-sm sm:text-base mb-0.5">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
