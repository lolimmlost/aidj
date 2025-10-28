// Audio Player Design System
// Unified design tokens and components for cohesive audio interface

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';

// Design Tokens
export const audioTokens = {
  // Colors
  colors: {
    primary: {
      background: 'hsl(var(--primary))',
      foreground: 'hsl(var(--primary-foreground))',
      hover: 'hsl(var(--primary)/0.9)',
    },
    accent: {
      background: 'hsl(var(--accent))',
      foreground: 'hsl(var(--accent-foreground))',
      hover: 'hsl(var(--accent)/0.8)',
    },
    muted: {
      background: 'hsl(var(--muted))',
      foreground: 'hsl(var(--muted-foreground))',
    },
    // Audio-specific colors
    playing: {
      background: 'hsl(142, 76%, 36%)', // green-700
      foreground: 'hsl(0, 0%, 98%)', // white
    },
    ai: {
      background: 'hsl(262, 83%, 58%)', // purple-600
      foreground: 'hsl(0, 0%, 98%)', // white
      subtle: 'hsl(262, 83%, 58%/0.1)', // purple-600/10
    },
    queue: {
      background: 'hsl(217, 91%, 60%)', // blue-600
      foreground: 'hsl(0, 0%, 98%)', // white
      subtle: 'hsl(217, 91%, 60%/0.1)', // blue-600/10
    },
  },
  
  // Spacing
  spacing: {
    xs: '0.25rem', // 4px
    sm: '0.5rem',  // 8px
    md: '0.75rem', // 12px
    lg: '1rem',    // 16px
    xl: '1.5rem',  // 24px
    xxl: '2rem',   // 32px
  },
  
  // Border radius
  radius: {
    sm: '0.25rem',  // 4px
    md: '0.375rem', // 6px
    lg: '0.5rem',   // 8px
    full: '9999px',
  },
  
  // Typography
  typography: {
    xs: '0.75rem',   // 12px
    sm: '0.875rem',  // 14px
    base: '1rem',    // 16px
    lg: '1.125rem',  // 18px
    xl: '1.25rem',   // 20px
  },
  
  // Transitions
  transitions: {
    fast: '150ms ease-in-out',
    normal: '200ms ease-in-out',
    slow: '300ms ease-in-out',
  },
  
  // Shadows
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  },
};

// Unified Audio Button Component
interface AudioButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'playing' | 'ai';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  children?: React.ReactNode;
  isActive?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
  'aria-label'?: string;
}

export const AudioButton = ({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  isActive = false,
  isLoading = false,
  disabled = false,
  className,
  onClick,
  'aria-label': ariaLabel,
  ...props
}: AudioButtonProps) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
  
  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
  };
  
  const variantClasses = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
    secondary: 'bg-accent text-accent-foreground hover:bg-accent/80',
    ghost: 'hover:bg-accent/20',
    playing: `bg-${audioTokens.colors.playing.background} text-${audioTokens.colors.playing.foreground} hover:bg-green-800 shadow-sm`,
    ai: `bg-${audioTokens.colors.ai.background} text-${audioTokens.colors.ai.foreground} hover:bg-purple-700 shadow-sm`,
  };
  
  const activeClasses = isActive ? 'ring-2 ring-primary ring-offset-2' : '';
  
  return (
    <Button
      className={cn(
        baseClasses,
        sizeClasses[size],
        variantClasses[variant],
        activeClasses,
        className
      )}
      onClick={onClick}
      disabled={disabled || isLoading}
      aria-label={ariaLabel}
      {...props}
    >
      {isLoading ? (
        <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
      ) : (
        <>
          {icon && <span className="flex-shrink-0">{icon}</span>}
          {children && <span className="ml-2">{children}</span>}
        </>
      )}
    </Button>
  );
};

// Unified Progress Bar Component
interface AudioProgressBarProps {
  value: number;
  max: number;
  onSeek?: (value: number) => void;
  showTime?: boolean;
  currentTime?: number;
  duration?: number;
  className?: string;
  compact?: boolean;
}

export const AudioProgressBar = ({
  value,
  max,
  onSeek,
  showTime = true,
  currentTime,
  duration,
  className,
  compact = false,
}: AudioProgressBarProps) => {
  const formatTime = (time: number) => {
    if (!isFinite(time) || time < 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  const containerClasses = compact
    ? 'flex items-center gap-2'
    : 'flex flex-col space-y-1 min-w-[180px]';
  
  return (
    <div className={cn(containerClasses, className)}>
      {showTime && !compact && (
        <div className="flex justify-between text-xs font-mono text-muted-foreground px-1">
          <span>{formatTime(currentTime || value)}</span>
          <span>{formatTime(duration || max)}</span>
        </div>
      )}
      <div className={cn('relative', compact ? 'w-full h-3 min-h-[48px] flex items-center py-3' : 'w-full')}>
        {compact && showTime && (
          <span className="text-xs font-mono text-muted-foreground min-w-[2.5rem]">
            {formatTime(currentTime || value)}
          </span>
        )}
        <Slider
          value={[value]}
          max={max}
          step={0.1}
          onValueChange={([newValue]) => onSeek?.(newValue)}
          className={cn('w-full', compact ? 'h-3' : 'h-1.5')}
          aria-label="Seek position"
          aria-valuemax={max}
          aria-valuenow={Math.round(value)}
          aria-valuetext={`${formatTime(currentTime || value)} of ${formatTime(duration || max)}`}
        />
        {compact && showTime && (
          <span className="text-xs font-mono text-muted-foreground min-w-[2.5rem]">
            {formatTime(duration || max)}
          </span>
        )}
      </div>
    </div>
  );
};

// Unified Volume Control Component
interface AudioVolumeControlProps {
  volume: number;
  onVolumeChange: (volume: number) => void;
  showLabel?: boolean;
  className?: string;
}

export const AudioVolumeControl = ({
  volume,
  onVolumeChange,
  showLabel = false,
  className,
}: AudioVolumeControlProps) => {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <AudioButton
        variant="ghost"
        size="sm"
        onClick={() => onVolumeChange(volume > 0 ? 0 : 0.5)}
        aria-label={volume > 0 ? 'Mute' : 'Unmute'}
        icon={
          volume > 0 ? (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          )
        }
      />
      <div className="relative min-h-[44px] flex items-center">
        <Slider
          value={[volume * 100]}
          max={100}
          step={1}
          onValueChange={([newValue]) => onVolumeChange(newValue / 100)}
          className="w-20 h-1.5"
          aria-label="Volume"
          aria-valuemax={100}
          aria-valuenow={Math.round(volume * 100)}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-muted-foreground w-8">
          {Math.round(volume * 100)}%
        </span>
      )}
    </div>
  );
};

// Unified Song Info Component
interface AudioSongInfoProps {
  song: {
    id: string;
    name?: string;
    title?: string;
    artist?: string;
    album?: string;
    albumId?: string;
  };
  isPlaying?: boolean;
  isLiked?: boolean;
  onToggleLike?: () => void;
  isPending?: boolean;
  compact?: boolean;
  className?: string;
}

export const AudioSongInfo = ({
  song,
  isPlaying = false,
  isLiked = false,
  onToggleLike,
  isPending = false,
  compact = false,
  className,
}: AudioSongInfoProps) => {
  const sizeClasses = compact
    ? "w-12 h-12 text-sm sm:w-10 sm:h-10"
    : "w-14 h-14 text-base";
    
  const textSizeClasses = compact
    ? "text-base sm:text-sm"
    : "text-lg";
    
  const artistSizeClasses = compact
    ? "text-sm sm:text-xs"
    : "text-sm";

  return (
    <div className={cn("flex items-center space-x-3 flex-1 min-w-0", className)}>
      <div className="relative flex-shrink-0">
        <div className={cn(
          "bg-gradient-to-br from-muted to-muted-foreground/20 rounded-lg flex items-center justify-center overflow-hidden shadow-sm",
          sizeClasses
        )}>
          {song.artist && (
            <span className="font-medium text-muted-foreground/80 truncate px-2 text-center">
              {song.artist.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </span>
          )}
          {isPlaying && (
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 animate-pulse rounded-lg" />
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className={cn(
          "font-semibold truncate block hover:text-primary transition-colors leading-tight",
          textSizeClasses
        )} title={song.name || song.title || 'Unknown Song'}>
          {song.name || song.title || 'Unknown Song'}
        </h3>
        <p className={cn(
          "font-medium truncate",
          artistSizeClasses,
          compact ? "text-foreground/80" : "text-foreground/70"
        )}>
          <span className="hover:text-primary transition-colors cursor-pointer" title={song.artist || 'Unknown Artist'}>
            {song.artist || 'Unknown Artist'}
          </span>
          {song.album && (
            <>
              {' • '}
              <span className="hover:text-primary transition-colors cursor-pointer" title={song.album}>
                {song.album}
              </span>
            </>
          )}
        </p>
      </div>
      {onToggleLike && (
        <AudioButton
          variant="ghost"
          size={compact ? 'sm' : 'md'}
          onClick={onToggleLike}
          disabled={isPending}
          aria-label={isLiked ? 'Unlike song' : 'Like song'}
          className={cn(
            "rounded-full hover:bg-accent/20 flex-shrink-0",
            isLiked ? "text-red-500" : ""
          )}
          icon={
            <svg className={cn("h-4 w-5", isLiked ? "fill-current" : "")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          }
        />
      )}
    </div>
  );
};

// Unified Status Badge Component
interface AudioStatusBadgeProps {
  status: 'playing' | 'paused' | 'loading' | 'error' | 'ai-active' | 'ai-loading';
  count?: number;
  className?: string;
}

export const AudioStatusBadge = ({
  status,
  count,
  className,
}: AudioStatusBadgeProps) => {
  const statusConfig = {
    playing: {
      label: 'Playing',
      className: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      icon: '▶️',
    },
    paused: {
      label: 'Paused',
      className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300',
      icon: '⏸️',
    },
    loading: {
      label: 'Loading',
      className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
      icon: '⏳',
    },
    error: {
      label: 'Error',
      className: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
      icon: '⚠️',
    },
    'ai-active': {
      label: 'AI DJ Active',
      className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
      icon: '✨',
    },
    'ai-loading': {
      label: 'AI DJ Loading',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      icon: '🤖',
    },
  };
  
  const config = statusConfig[status];
  
  return (
    <Badge className={cn(config.className, className)}>
      <span className="mr-1">{config.icon}</span>
      {config.label}
      {count !== undefined && (
        <span className="ml-1">({count})</span>
      )}
    </Badge>
  );
};

// Unified Container Component
interface AudioContainerProps {
  children: React.ReactNode;
  variant?: 'player' | 'panel' | 'card';
  className?: string;
}

export const AudioContainer = ({
  children,
  variant = 'player',
  className,
}: AudioContainerProps) => {
  const variantClasses = {
    player: 'bg-background/95 backdrop-blur-sm border-t border-border/50 shadow-lg',
    panel: 'bg-card text-card-foreground rounded-lg shadow-lg border',
    card: 'bg-card text-card-foreground rounded-lg shadow-md border',
  };
  
  return (
    <div className={cn(variantClasses[variant], className)}>
      {children}
    </div>
  );
};