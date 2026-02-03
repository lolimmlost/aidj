import { Link } from '@tanstack/react-router';
import { Download, BarChart3, Heart, Cog, Disc3, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Quick access links to additional features
 * Clean, minimal design with hover effects
 */
export function MoreFeatures() {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Quick Access
        </h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
        {/* DJ Features - mobile only (hidden on lg+ where full section shows) */}
        <QuickLink
          to="/dj"
          icon={<Disc3 className="h-5 w-5" />}
          label="DJ Tools"
          color="violet"
          className="lg:hidden"
        />
        <QuickLink
          to="/downloads"
          icon={<Download className="h-5 w-5" />}
          label="Downloads"
          color="cyan"
        />
        <QuickLink
          to="/dashboard/analytics"
          icon={<BarChart3 className="h-5 w-5" />}
          label="Analytics"
          color="emerald"
        />
        <QuickLink
          to="/settings/recommendations"
          icon={<Heart className="h-5 w-5" />}
          label="Preferences"
          color="rose"
        />
        <QuickLink
          to="/config"
          icon={<Cog className="h-5 w-5" />}
          label="Config"
          color="amber"
        />
      </div>
    </section>
  );
}

interface QuickLinkProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  color: 'violet' | 'cyan' | 'emerald' | 'rose' | 'amber';
  className?: string;
}

function QuickLink({ to, icon, label, color, className = '' }: QuickLinkProps) {
  const colorClasses = {
    violet: 'hover:bg-violet-500/5 hover:border-violet-500/30 [&_svg]:text-violet-500',
    cyan: 'hover:bg-cyan-500/5 hover:border-cyan-500/30 [&_svg]:text-cyan-500',
    emerald: 'hover:bg-emerald-500/5 hover:border-emerald-500/30 [&_svg]:text-emerald-500',
    rose: 'hover:bg-rose-500/5 hover:border-rose-500/30 [&_svg]:text-rose-500',
    amber: 'hover:bg-amber-500/5 hover:border-amber-500/30 [&_svg]:text-amber-500',
  };

  return (
    <Link to={to} className={cn('group', className)}>
      <div
        className={cn(
          'quick-access-link',
          colorClasses[color]
        )}
      >
        <div className="transition-colors">
          {icon}
        </div>
        <span className="text-sm font-medium flex-1">{label}</span>
        <ArrowRight className="hidden sm:block h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-foreground/50 transition-all group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
