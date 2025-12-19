import { Link } from '@tanstack/react-router';
import { Download, BarChart3, Heart, Cog, Disc3 } from 'lucide-react';

/**
 * Additional features grid at the bottom of the dashboard
 */
export function MoreFeatures() {
  return (
    <section className="space-y-4">
      <div className="text-center">
        <h3 className="text-base font-semibold text-muted-foreground">More Features</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {/* DJ Features - mobile only (hidden on md+ where full section shows) */}
        <CompactLink
          to="/dj"
          icon={<Disc3 className="h-5 w-5" />}
          label="DJ Tools"
          className="md:hidden"
        />
        <CompactLink
          to="/downloads"
          icon={<Download className="h-5 w-5" />}
          label="Downloads"
        />
        <CompactLink
          to="/dashboard/analytics"
          icon={<BarChart3 className="h-5 w-5" />}
          label="Analytics"
        />
        <CompactLink
          to="/settings/recommendations"
          icon={<Heart className="h-5 w-5" />}
          label="Preferences"
        />
        <CompactLink
          to="/config"
          icon={<Cog className="h-5 w-5" />}
          label="Configuration"
        />
      </div>
    </section>
  );
}

interface CompactLinkProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  className?: string;
}

function CompactLink({ to, icon, label, className = '' }: CompactLinkProps) {
  return (
    <Link to={to} className={`group ${className}`}>
      <div className="p-4 rounded-xl border border-border/50 hover:border-primary/50 bg-card/50 hover:bg-card transition-all duration-200 hover:-translate-y-0.5">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors text-primary">
            {icon}
          </div>
          <span className="text-sm font-medium">{label}</span>
        </div>
      </div>
    </Link>
  );
}
