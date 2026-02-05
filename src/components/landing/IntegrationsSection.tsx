import { Music, Database, Radio, Download, Youtube, Brain, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Integration {
  name: string;
  description: string;
  icon: LucideIcon;
  required: boolean;
  color: string;
}

const integrations: Integration[] = [
  { name: 'Navidrome', description: 'Music library & streaming', icon: Music, required: true, color: 'bg-cyan-500/20 text-cyan-500' },
  { name: 'PostgreSQL', description: 'Application database', icon: Database, required: true, color: 'bg-violet-500/20 text-violet-500' },
  { name: 'Last.fm', description: 'Scrobbling & similar tracks', icon: Radio, required: false, color: 'bg-pink-500/20 text-pink-500' },
  { name: 'Lidarr', description: 'Music acquisition', icon: Download, required: false, color: 'bg-emerald-500/20 text-emerald-500' },
  { name: 'MeTube', description: 'YouTube audio downloads', icon: Youtube, required: false, color: 'bg-amber-500/20 text-amber-500' },
  { name: 'Ollama / LLM', description: 'AI DJ recommendations', icon: Brain, required: false, color: 'bg-violet-500/20 text-violet-500' },
];

export default function IntegrationsSection() {
  return (
    <section className="relative py-24 sm:py-32 px-4 bg-background">
      <div className="relative z-10 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Seamless connections
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Plays well with{' '}
            <span className="text-gradient-brand">others</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          {integrations.map((integration) => {
            const Icon = integration.icon;
            return (
              <div key={integration.name} className="integration-card">
                <div className="flex items-start justify-between mb-4">
                  <div
                    className={`w-10 h-10 rounded-xl ${integration.color} flex items-center justify-center`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <Badge
                    variant={integration.required ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {integration.required ? 'Required' : 'Optional'}
                  </Badge>
                </div>
                <h3 className="font-semibold mb-1">{integration.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {integration.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
