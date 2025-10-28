// DJ Controls Component
// Provides professional DJ mixing controls and visualization

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Play, Pause, SkipForward, SkipBack, 
  Volume2, VolumeX, Headphones, 
  Settings, Crosshair, Activity, Zap,
  TrendingUp, TrendingDown, Waves, MicOff
} from 'lucide-react';
import { useAudioStore } from '@/lib/stores/audio';
import { useDJSession } from '@/lib/hooks/useDJSession';
import { toast } from 'sonner';

interface DJControlsProps {
  compact?: boolean;
  showVisualization?: boolean;
}

export function DJControls({ compact = false, showVisualization = true }: DJControlsProps) {
  const [sessionDuration, setSessionDuration] = useState(0);
  const {
    isPlaying, currentTime, duration, volume,
    nextSong, previousSong, setIsPlaying,
    setVolume, setCrossfadeEnabled, setCrossfadeDuration,
    crossfadeEnabled, crossfadeDuration
  } = useAudioStore();
  
  const {
    djSession, isAutoMixing, isTransitioning,
    currentTransition, startDJSession, endDJSession,
    setAutoMixing, autoMixNext, completeTransition
  } = useDJSession();

  const [showSettings, setShowSettings] = useState(false);
  const [crossfadeProgress, setCrossfadeProgress] = useState(0);

  // Handle crossfade progress
  useEffect(() => {
    if (isTransitioning && currentTransition) {
      const startTime = Date.now();
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(100, (elapsed / (currentTransition.duration * 1000)) * 100);
        setCrossfadeProgress(progress);
        
        if (progress >= 100) {
          clearInterval(interval);
          completeTransition();
          setCrossfadeProgress(0);
        }
      }, 50);
      
      return () => clearInterval(interval);
    } else {
      setCrossfadeProgress(0);
    }
  }, [isTransitioning, currentTransition, completeTransition]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleStartDJSession = () => {
    const sessionName = prompt('Enter DJ session name:', `DJ Session ${new Date().toLocaleTimeString()}`);
    if (sessionName) {
      startDJSession(sessionName);
      toast.success(`🎧 DJ Session "${sessionName}" started`);
    }
  };

  const handleEndDJSession = () => {
    if (djSession) {
      endDJSession();
      toast.success(`🎧 DJ Session "${djSession.name}" ended`);
    }
  };

  const handleAutoMixToggle = (enabled: boolean) => {
    setAutoMixing(enabled);
    if (enabled && !isTransitioning) {
      autoMixNext().then((transition: any) => {
        if (transition) {
          toast.success(`🎚️ Auto-mixing: ${transition.transitionType}`);
        }
      }).catch((error: any) => {
        toast.error('Auto-mixing failed', { description: error.message });
      });
    }
  };

  const handleCrossfadeDurationChange = (value: number[]) => {
    setCrossfadeDuration(value[0]);
  };

  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0] / 100);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-2 bg-background/95 backdrop-blur-sm rounded-lg border">
        <Button
          variant="ghost"
          size="sm"
          onClick={previousSong}
          disabled={!djSession}
          className="h-8 w-8"
        >
          <SkipBack className="h-3 w-3" />
        </Button>
        
        <Button
          variant={isPlaying ? "default" : "ghost"}
          size="sm"
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={!djSession}
          className="h-8 w-8"
        >
          {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={nextSong}
          disabled={!djSession}
          className="h-8 w-8"
        >
          <SkipForward className="h-3 w-3" />
        </Button>
        
        <div className="w-px h-6 bg-border mx-1" />
        
        <Switch
          checked={isAutoMixing}
          onCheckedChange={handleAutoMixToggle}
          disabled={!djSession}
        />
        
        <Badge variant={isTransitioning ? "default" : "secondary"} className="text-xs">
          {isTransitioning ? "MIXING" : "READY"}
        </Badge>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main DJ Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">DJ Controls</CardTitle>
            <div className="flex items-center gap-2">
              {djSession && (
                <Badge variant="outline" className="text-xs">
                  {djSession.name}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Session Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!djSession ? (
                <Button onClick={handleStartDJSession} className="gap-2">
                  <Headphones className="h-4 w-4" />
                  Start Session
                </Button>
              ) : (
                <Button onClick={handleEndDJSession} variant="outline" className="gap-2">
                  <MicOff className="h-4 w-4" />
                  End Session
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Switch
                checked={isAutoMixing}
                onCheckedChange={handleAutoMixToggle}
                disabled={!djSession}
              />
              <span className="text-sm font-medium">Auto-Mix</span>
              {isTransitioning && (
                <Badge variant="default" className="animate-pulse">
                  Mixing
                </Badge>
              )}
            </div>
          </div>

          {/* Transport Controls */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="lg"
              onClick={previousSong}
              disabled={!djSession}
              className="h-12 w-12 rounded-full"
            >
              <SkipBack className="h-5 w-5" />
            </Button>
            
            <Button
              variant={isPlaying ? "default" : "ghost"}
              size="lg"
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={!djSession}
              className="h-14 w-14 rounded-full"
            >
              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
            </Button>
            
            <Button
              variant="ghost"
              size="lg"
              onClick={nextSong}
              disabled={!djSession}
              className="h-12 w-12 rounded-full"
            >
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <Progress 
              value={duration ? (currentTime / duration) * 100 : 0} 
              className="h-2"
            />
          </div>

          {/* Crossfade Visualization */}
          {isTransitioning && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1">
                  <Waves className="h-3 w-3" />
                  Crossfade
                </span>
                <span>{Math.round(crossfadeProgress)}%</span>
              </div>
              <Progress value={crossfadeProgress} className="h-2" />
              {currentTransition && (
                <div className="text-xs text-muted-foreground">
                  {currentTransition.notes}
                </div>
              )}
            </div>
          )}

          {/* Volume Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1">
                {volume > 0 ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
                Volume
              </span>
              <span>{Math.round(volume * 100)}%</span>
            </div>
            <Slider
              value={[volume * 100]}
              onValueChange={handleVolumeChange}
              max={100}
              step={1}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>

      {/* Settings Panel */}
      {showSettings && (
        <Card>
          <CardHeader>
            <CardTitle>DJ Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Crossfade Settings */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Crossfade</span>
                <Switch
                  checked={crossfadeEnabled}
                  onCheckedChange={setCrossfadeEnabled}
                />
              </div>
              
              {crossfadeEnabled && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span>Duration</span>
                    <span>{crossfadeDuration}s</span>
                  </div>
                  <Slider
                    value={[crossfadeDuration]}
                    onValueChange={handleCrossfadeDurationChange}
                    min={1}
                    max={16}
                    step={0.5}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            {/* Auto-Mix Settings */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Auto-Mix Mode</span>
                <Badge variant="outline">
                  {isAutoMixing ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              
              {isAutoMixing && (
                <div className="text-xs text-muted-foreground">
                  Automatically selects and mixes compatible songs based on BPM, key, and energy levels.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* DJ Visualization */}
      {showVisualization && djSession && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Session Visualization
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Session Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{djSession.queue.length}</div>
                <div className="text-xs text-muted-foreground">Queue Length</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{djSession.totalTransitions}</div>
                <div className="text-xs text-muted-foreground">Transitions</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {djSession.averageCompatibility ? Math.round(djSession.averageCompatibility * 100) : 0}%
                </div>
                <div className="text-xs text-muted-foreground">Avg Compatibility</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {djSession && Math.round(((Date.now() - djSession.startTime.getTime()) / 60000))}
                </div>
                <div className="text-xs text-muted-foreground">Duration</div>
              </div>
            </div>

            {/* Energy History */}
            {djSession.energyHistory.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Zap className="h-4 w-4" />
                  Energy Flow
                </div>
                <div className="flex items-end gap-1 h-16">
                  {djSession.energyHistory.slice(-20).map((energy: number, index: number) => (
                    <div
                      key={index}
                      className="flex-1 bg-primary rounded-t"
                      style={{ height: `${energy * 100}%` }}
                      title={`Energy: ${Math.round(energy * 100)}%`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* BPM History */}
            {djSession.bpmHistory.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Crosshair className="h-4 w-4" />
                  BPM Progression
                </div>
                <div className="flex items-end gap-1 h-16">
                  {djSession.bpmHistory.slice(-20).map((bpm: number, index: number) => {
                    const normalizedBPM = (bpm - 60) / 120; // Normalize 60-180 BPM to 0-1
                    return (
                      <div
                        key={index}
                        className="flex-1 bg-secondary rounded-t"
                        style={{ height: `${Math.max(10, normalizedBPM * 100)}%` }}
                        title={`${bpm} BPM`}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}