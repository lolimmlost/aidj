// DJ Feature Cards Component
// Displays all available DJ features as cards with links to their respective pages

import React from 'react';
import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Disc, 
  Music, 
  Zap, 
  Radio, 
  Activity, 
  Waves,
  Sliders,
  Headphones,
  Settings,
  TrendingUp,
  BarChart3,
  Shuffle,
  PlayCircle
} from 'lucide-react';

// DJ Feature Card Component
const DJFeatureCard: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  to: string;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  isNew?: boolean;
  isBeta?: boolean;
}> = ({ title, description, icon, to, badge, badgeVariant = 'secondary', isNew, isBeta }) => {
  return (
    <Link to={to} className="block">
      <Card className="h-full transition-all duration-200 hover:shadow-lg hover:scale-[1.02] cursor-pointer border-2 hover:border-primary/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                {icon}
              </div>
              <div className="flex items-center gap-2">
                {isNew && (
                  <Badge variant="default" className="text-xs">
                    NEW
                  </Badge>
                )}
                {isBeta && (
                  <Badge variant="outline" className="text-xs">
                    BETA
                  </Badge>
                )}
                {badge && (
                  <Badge variant={badgeVariant} className="text-xs">
                    {badge}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-sm">
            {description}
          </CardDescription>
        </CardContent>
      </Card>
    </Link>
  );
};

// Main DJ Feature Cards Component
export const DJFeatureCards: React.FC = () => {
  const djFeatures = [
    {
      title: "DJ Mixer",
      description: "Professional DJ mixing interface with dual decks, crossfader, and real-time audio visualization",
      icon: <Disc className="h-6 w-6" />,
      to: "/dj/mixer",
      isNew: true,
      badge: "Pro"
    },
    {
      title: "DJ Queue Manager",
      description: "Advanced queue management with auto-mixing, priority settings, and smart recommendations",
      icon: <Music className="h-6 w-6" />,
      to: "/dj/queue",
      isNew: true,
      badge: "Auto"
    },
    {
      title: "DJ Controls",
      description: "Essential DJ controls for playback, crossfading, and session management",
      icon: <Sliders className="h-6 w-6" />,
      to: "/dj/controls"
    },
    {
      title: "AI DJ Assistant",
      description: "AI-powered DJ that analyzes your library and creates intelligent mixes",
      icon: <Radio className="h-6 w-6" />,
      to: "/dj/ai-assistant",
      badge: "AI",
      isBeta: true
    },
    {
      title: "Harmonic Mixer",
      description: "Advanced harmonic mixing with key detection and circle of fifths progression",
      icon: <Activity className="h-6 w-6" />,
      to: "/dj/harmonic-mixer",
      badge: "Pro"
    },
    {
      title: "Energy Flow Analyzer",
      description: "Analyze and visualize energy flow between tracks for perfect transitions",
      icon: <Zap className="h-6 w-6" />,
      to: "/dj/energy-analyzer",
      isNew: true
    },
    {
      title: "Transition Effects",
      description: "Professional transition effects including filters, echoes, and beatmatching",
      icon: <Waves className="h-6 w-6" />,
      to: "/dj/transitions"
    },
    {
      title: "Genre Analyzer",
      description: "Genre-based mixing recommendations and compatibility analysis",
      icon: <BarChart3 className="h-6 w-6" />,
      to: "/dj/genre-analyzer",
      isBeta: true
    },
    {
      title: "Auto-Mix Settings",
      description: "Configure auto-mixing behavior, compatibility thresholds, and mixing strategies",
      icon: <Settings className="h-6 w-6" />,
      to: "/dj/automix-settings"
    },
    {
      title: "Session Analytics",
      description: "Detailed analytics of your DJ sessions including energy curves and transition success",
      icon: <TrendingUp className="h-6 w-6" />,
      to: "/dj/analytics",
      isNew: true
    },
    {
      title: "Smart Playlist Generator",
      description: "Generate playlists based on energy, genre, and harmonic compatibility",
      icon: <Shuffle className="h-6 w-6" />,
      to: "/dj/playlist-generator"
    },
    {
      title: "Beat Synchronizer",
      description: "Advanced beat matching and phase alignment for seamless transitions",
      icon: <PlayCircle className="h-6 w-6" />,
      to: "/dj/beat-sync",
      badge: "Pro"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">DJ Features</h2>
        <p className="text-muted-foreground">
          Professional DJ tools and features to enhance your mixing experience
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {djFeatures.map((feature, index) => (
          <DJFeatureCard
            key={index}
            title={feature.title}
            description={feature.description}
            icon={feature.icon}
            to={feature.to}
            badge={feature.badge}
            isNew={feature.isNew}
            isBeta={feature.isBeta}
          />
        ))}
      </div>
      
      <div className="mt-8 p-4 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <Headphones className="h-5 w-5" />
          <h3 className="font-semibold">Pro Tip</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Start with the DJ Mixer for a complete mixing experience, or use individual features to enhance specific aspects of your workflow. 
          Features marked with "Pro" offer advanced capabilities for professional DJs.
        </p>
      </div>
    </div>
  );
};

export default DJFeatureCards;