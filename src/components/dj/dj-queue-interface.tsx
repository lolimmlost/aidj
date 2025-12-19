// DJ Queue Management Interface
// Provides comprehensive queue management with auto-mixing features

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Play,
  Pause,
  Trash2,
  Settings,
  Clock,
  Music,
  Zap,
  Activity,
  RefreshCw,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import type { 
  DJQueueEntry, 
  DJQueueConfig, 
  DJQueueStats, 
  AutoMixStrategy,
  AutoMixOptions 
} from '@/lib/services/dj-queue-manager';
import { createDJQueueManager } from '@/lib/services/dj-queue-manager';
import type { Song } from '@/lib/types/song';

// Props for DJ Queue Interface
interface DJQueueInterfaceProps {
  songs: Song[];
  onSongSelect?: (song: Song) => void;
  onSongPlay?: (song: Song) => void;
}

// Queue item component
const QueueItem: React.FC<{
  entry: DJQueueEntry;
  isActive?: boolean;
  isNext?: boolean;
  onPlay?: () => void;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onChangePriority?: (priority: DJQueueEntry['priority']) => void;
}> = ({ 
  entry, 
  isActive, 
  isNext, 
  onPlay, 
  onRemove, 
  onMoveUp, 
  onMoveDown,
  onChangePriority 
}) => {
  const getPriorityColor = (priority: DJQueueEntry['priority']) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'normal': return 'bg-blue-500';
      case 'low': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`
      flex items-center p-3 rounded-lg border transition-all
      ${isActive ? 'bg-blue-900/50 border-blue-500' : 
        isNext ? 'bg-gray-800/50 border-gray-600' : 
        'bg-gray-900/30 border-gray-700'}
      hover:bg-gray-800/50
    `}>
      {/* Status indicator */}
      <div className="flex items-center space-x-2 mr-4">
        {isActive && (
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        )}
        {isNext && !isActive && (
          <div className="w-2 h-2 bg-yellow-500 rounded-full" />
        )}
        <div className={`w-2 h-2 rounded-full ${getPriorityColor(entry.priority)}`} />
      </div>

      {/* Song info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2">
          <h4 className="font-medium truncate">{entry.song.name}</h4>
          {entry.addedBy === 'auto' && (
            <Badge variant="secondary" className="text-xs">
              Auto
            </Badge>
          )}
          {entry.autoMixEnabled && (
            <Badge variant="outline" className="text-xs">
              Mix
            </Badge>
          )}
        </div>
        <div className="text-sm text-gray-400 truncate">
          {entry.song.artist} • {entry.song.album}
        </div>
        {entry.analysis && (
          <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
            <span className="flex items-center">
              <Clock className="h-3 w-3 mr-1" />
              {formatDuration(entry.song.duration || 0)}
            </span>
            <span className="flex items-center">
              <Activity className="h-3 w-3 mr-1" />
              {entry.analysis.bpm} BPM
            </span>
            <span className="flex items-center">
              <Music className="h-3 w-3 mr-1" />
              {entry.analysis.key}
            </span>
            <span className="flex items-center">
              <Zap className="h-3 w-3 mr-1" />
              {Math.round(entry.analysis.energy * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-1">
        <Button variant="ghost" size="sm" onClick={onPlay}>
          {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        
        <Select
          value={entry.priority}
          onValueChange={(value: DJQueueEntry['priority']) => onChangePriority?.(value)}
        >
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" onClick={onMoveUp}>
          <ChevronUp className="h-4 w-4" />
        </Button>
        
        <Button variant="ghost" size="sm" onClick={onMoveDown}>
          <ChevronDown className="h-4 w-4" />
        </Button>
        
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

// Auto-mix settings component
const AutoMixSettings: React.FC<{
  options: AutoMixOptions;
  onChange: (options: Partial<AutoMixOptions>) => void;
}> = ({ options, onChange }) => {
  return (
    <Card className="bg-gray-900 text-white border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg">Auto-Mix Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Strategy */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Mixing Strategy</label>
          <Select
            value={options.strategy}
            onValueChange={(value: AutoMixStrategy) => onChange({ strategy: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="harmonic">Harmonic Mixing</SelectItem>
              <SelectItem value="energy">Energy Flow</SelectItem>
              <SelectItem value="bpm">BPM Matching</SelectItem>
              <SelectItem value="genre">Genre Consistency</SelectItem>
              <SelectItem value="balanced">Balanced</SelectItem>
              <SelectItem value="crowd_pleaser">Crowd Pleaser</SelectItem>
              <SelectItem value="experimental">Experimental</SelectItem>
              <SelectItem value="classic_dj">Classic DJ</SelectItem>
              <SelectItem value="radio_friendly">Radio Friendly</SelectItem>
              <SelectItem value="underground">Underground</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Compatibility threshold */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Min Compatibility: {Math.round(options.minCompatibility * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={options.minCompatibility * 100}
            onChange={(e) => onChange({ minCompatibility: Number(e.target.value) / 100 })}
            className="w-full"
          />
        </div>

        {/* Energy range */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Energy Range</label>
          <div className="flex items-center space-x-2">
            <Input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={options.energyRange.min}
              onChange={(e) => onChange({ 
                energyRange: { ...options.energyRange, min: Number(e.target.value) }
              })}
              className="w-20"
            />
            <span>to</span>
            <Input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={options.energyRange.max}
              onChange={(e) => onChange({ 
                energyRange: { ...options.energyRange, max: Number(e.target.value) }
              })}
              className="w-20"
            />
          </div>
        </div>

        {/* BPM range */}
        <div className="space-y-2">
          <label className="text-sm font-medium">BPM Range</label>
          <div className="flex items-center space-x-2">
            <Input
              type="number"
              min="60"
              max="200"
              value={options.bpmRange.min}
              onChange={(e) => onChange({ 
                bpmRange: { ...options.bpmRange, min: Number(e.target.value) }
              })}
              className="w-20"
            />
            <span>to</span>
            <Input
              type="number"
              min="60"
              max="200"
              value={options.bpmRange.max}
              onChange={(e) => onChange({ 
                bpmRange: { ...options.bpmRange, max: Number(e.target.value) }
              })}
              className="w-20"
            />
          </div>
        </div>

        {/* Allow key changes */}
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Allow Key Changes</label>
          <Switch
            checked={options.allowKeyChanges}
            onCheckedChange={(checked) => onChange({ allowKeyChanges: checked })}
          />
        </div>

        {/* Max key changes */}
        {options.allowKeyChanges && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Max Key Changes: {options.maxKeyChanges}
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={options.maxKeyChanges}
              onChange={(e) => onChange({ maxKeyChanges: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Queue statistics component
const QueueStats: React.FC<{ stats: DJQueueStats }> = ({ stats }) => {
  return (
    <Card className="bg-gray-900 text-white border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg">Queue Statistics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">{stats.totalSongs}</div>
            <div className="text-sm text-gray-400">Total Songs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">{stats.autoMixedSongs}</div>
            <div className="text-sm text-gray-400">Auto-Mixed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-400">{Math.round(stats.averageBPM)}</div>
            <div className="text-sm text-gray-400">Avg BPM</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-400">
              {Math.round(stats.averageEnergy * 100)}%
            </div>
            <div className="text-sm text-gray-400">Avg Energy</div>
          </div>
        </div>

        {/* Key distribution */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Key Distribution</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.keyDistribution).map(([key, count]) => (
              <Badge key={key} variant="outline" className="text-xs">
                {key}: {count}
              </Badge>
            ))}
          </div>
        </div>

        {/* Genre distribution */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Genre Distribution</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.genreDistribution).map(([genre, count]) => (
              <Badge key={genre} variant="outline" className="text-xs">
                {genre}: {count}
              </Badge>
            ))}
          </div>
        </div>

        {/* Transition statistics */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-lg font-bold text-blue-400">{stats.transitionCount}</div>
            <div className="text-xs text-gray-400">Transitions</div>
          </div>
          <div>
            <div className="text-lg font-bold text-green-400">{stats.harmonicTransitions}</div>
            <div className="text-xs text-gray-400">Harmonic</div>
          </div>
          <div>
            <div className="text-lg font-bold text-yellow-400">{stats.energyTransitions}</div>
            <div className="text-xs text-gray-400">Energy</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Main DJ Queue Interface
export const DJQueueInterface: React.FC<DJQueueInterfaceProps> = ({ 
  songs, 
  onSongSelect, 
  onSongPlay 
}) => {
  const [queueManager] = useState(() => createDJQueueManager());
  const [queue, setQueue] = useState<DJQueueEntry[]>([]);
  const [stats, setStats] = useState<DJQueueStats | null>(null);
  const [autoMixOptions, setAutoMixOptions] = useState<AutoMixOptions>();
  const [config, setConfig] = useState<DJQueueConfig>();
  const [activeTab, setActiveTab] = useState('queue');

  // Initialize queue manager
  useEffect(() => {
    const initializeQueue = async () => {
      try {
        await queueManager.initialize(songs);
        setQueue(queueManager.getQueue());
        setStats(queueManager.getQueueStats());
        setAutoMixOptions(queueManager.getAutoMixOptions());
        setConfig(queueManager.getConfig());
      } catch (error) {
        console.error('Failed to initialize queue:', error);
      }
    };

    initializeQueue();
  }, [songs, queueManager]);

  // Update queue when songs change
  useEffect(() => {
    const updateQueue = async () => {
      try {
        await queueManager.initialize(songs);
        setQueue(queueManager.getQueue());
        setStats(queueManager.getQueueStats());
      } catch (error) {
        console.error('Failed to update queue:', error);
      }
    };

    updateQueue();
  }, [songs, queueManager]);

  // Handle song actions
  const handlePlaySong = useCallback(async (entry: DJQueueEntry) => {
    try {
      onSongPlay?.(entry.song);
      onSongSelect?.(entry.song);
    } catch (error) {
      console.error('Failed to play song:', error);
    }
  }, [onSongPlay, onSongSelect]);

  const handleRemoveSong = useCallback(async (entry: DJQueueEntry) => {
    try {
      queueManager.removeSong(entry.id);
      setQueue(queueManager.getQueue());
      setStats(queueManager.getQueueStats());
    } catch (error) {
      console.error('Failed to remove song:', error);
    }
  }, [queueManager]);

  const handleMoveSong = useCallback(async (fromPosition: number, toPosition: number) => {
    try {
      queueManager.reorderQueue(fromPosition, toPosition);
      setQueue(queueManager.getQueue());
    } catch (error) {
      console.error('Failed to move song:', error);
    }
  }, [queueManager]);

  const handleChangePriority = useCallback(async (entry: DJQueueEntry, priority: DJQueueEntry['priority']) => {
    try {
      queueManager.changePriority(entry.id, priority);
      setQueue(queueManager.getQueue());
    } catch (error) {
      console.error('Failed to change priority:', error);
    }
  }, [queueManager]);

  const handleAutoRefill = useCallback(async () => {
    try {
      await queueManager.autoRefillQueue();
      setQueue(queueManager.getQueue());
      setStats(queueManager.getQueueStats());
    } catch (error) {
      console.error('Failed to auto-refill queue:', error);
    }
  }, [queueManager]);

  const handleClearQueue = useCallback(async () => {
    try {
      queueManager.clearQueue();
      setQueue([]);
      setStats(null);
    } catch (error) {
      console.error('Failed to clear queue:', error);
    }
  }, [queueManager]);

  const handleAutoMixOptionsChange = useCallback((updates: Partial<AutoMixOptions>) => {
    queueManager.updateAutoMixOptions(updates);
    setAutoMixOptions(queueManager.getAutoMixOptions());
  }, [queueManager]);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">DJ Queue Manager</h1>
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={handleAutoRefill}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Auto-Refill
            </Button>
            <Button variant="outline" onClick={handleClearQueue}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Queue
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="queue">Queue</TabsTrigger>
            <TabsTrigger value="automix">Auto-Mix</TabsTrigger>
            <TabsTrigger value="stats">Statistics</TabsTrigger>
          </TabsList>

          {/* Queue Tab */}
          <TabsContent value="queue" className="space-y-4">
            <Card className="bg-gray-900 text-white border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>Queue ({queue.length} songs)</span>
                  <div className="flex items-center space-x-2">
                    {config?.autoMixEnabled && (
                      <Badge variant="default" className="text-xs">
                        Auto-Mix ON
                      </Badge>
                    )}
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {queue.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg">Queue is empty</p>
                    <p className="text-sm">Add songs or enable auto-mixing</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {queue.map((entry, index) => (
                      <QueueItem
                        key={entry.id}
                        entry={entry}
                        isActive={index === 0}
                        isNext={index === 1}
                        onPlay={() => handlePlaySong(entry)}
                        onRemove={() => handleRemoveSong(entry)}
                        onMoveUp={() => index > 0 && handleMoveSong(index, index - 1)}
                        onMoveDown={() => index < queue.length - 1 && handleMoveSong(index, index + 1)}
                        onChangePriority={(priority) => handleChangePriority(entry, priority)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Auto-Mix Tab */}
          <TabsContent value="automix" className="space-y-4">
            {autoMixOptions && (
              <AutoMixSettings
                options={autoMixOptions}
                onChange={handleAutoMixOptionsChange}
              />
            )}
          </TabsContent>

          {/* Statistics Tab */}
          <TabsContent value="stats" className="space-y-4">
            {stats && <QueueStats stats={stats} />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default DJQueueInterface;