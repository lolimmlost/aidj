// Story 7.6: Set Builder Page
// Professional DJ set planning with templates and AI assistance

import { createFileRoute } from '@tanstack/react-router';
import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  useSetBuilderStore,
  SET_TEMPLATES,
  type SavedDJSet,
} from '@/lib/stores/set-builder';
import {
  planDJSet,
  type DJSetPlanningOptions,
  DEFAULT_PLANNING_OPTIONS,
} from '@/lib/services/dj-set-planner';
import { getRandomSongs } from '@/lib/services/navidrome';
import { toast } from 'sonner';
import {
  Upload,
  Trash2,
  Music,
  Clock,
  Zap,
  Activity,
  ChevronDown,
  ChevronUp,
  Loader2,
  History,
  Wand2,
  ListMusic,
  Settings,
} from 'lucide-react';
import { PageLayout } from '@/components/ui/page-layout';

export const Route = createFileRoute('/dj/set-builder')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw new Error('Unauthorized');
    }
    return { user: context.user };
  },
  component: SetBuilderPage,
});

function SetBuilderPage() {
  const {
    currentSet,
    history,
    isGenerating,
    generationProgress,
    setCurrentSet,
    saveSet,
    deleteSet,
    setGenerating,
    markExported,
  } = useSetBuilderStore();

  const [activeTab, setActiveTab] = useState('templates');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customOptions, setCustomOptions] = useState<Partial<DJSetPlanningOptions>>({
    ...DEFAULT_PLANNING_OPTIONS,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [setName, setSetName] = useState('');
  const [plannedFor, setPlannedFor] = useState('');

  // Generate a DJ set
  const handleGenerateSet = useCallback(async () => {
    try {
      setGenerating(true, 'Fetching songs from library...');

      // Get random songs from the library
      const songs = await getRandomSongs(100);

      if (songs.length < 10) {
        toast.error('Not enough songs in library', {
          description: 'Need at least 10 songs to generate a set.',
        });
        setGenerating(false);
        return;
      }

      setGenerating(true, 'Planning DJ set...');

      // Get options from template or custom
      const template = selectedTemplate
        ? SET_TEMPLATES.find((t) => t.id === selectedTemplate)
        : null;

      const options: Partial<DJSetPlanningOptions> = {
        ...(template?.options || customOptions),
        plannedFor: plannedFor || undefined,
      };

      // Plan the set
      const djSet = await planDJSet(songs, options);

      // Override name if provided
      if (setName) {
        djSet.name = setName;
      }

      setGenerating(true, 'Saving set...');

      // Save the set
      saveSet(djSet, selectedTemplate || undefined);

      toast.success('DJ Set generated!', {
        description: `${djSet.songs.length} tracks, ${djSet.duration} minutes`,
      });

      setActiveTab('current');
    } catch (error) {
      console.error('Set generation error:', error);
      toast.error('Failed to generate set', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setGenerating(false);
    }
  }, [selectedTemplate, customOptions, setName, plannedFor, saveSet, setGenerating]);

  // Export set to Navidrome playlist
  const handleExportToNavidrome = useCallback(async () => {
    if (!currentSet) return;

    try {
      const response = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: currentSet.name,
          comment: currentSet.description,
          songIds: currentSet.songs.map((s) => s.song.id),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create playlist');
      }

      const data = await response.json();
      markExported(currentSet.id, data.playlist?.id);

      toast.success('Exported to Navidrome!', {
        description: `Playlist "${currentSet.name}" created`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Export failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [currentSet, markExported]);

  // Load a set from history
  const handleLoadSet = useCallback(
    (set: SavedDJSet) => {
      setCurrentSet(set);
      setActiveTab('current');
    },
    [setCurrentSet]
  );

  return (
    <PageLayout
      title="Set Builder"
      description="Plan professional DJ sets"
      icon={<ListMusic className="h-5 w-5" />}
      backLink="/dj"
      backLabel="DJ Tools"
      compact
      actions={
        currentSet ? (
          <Badge variant="secondary" className="text-lg px-4 py-2">
            {currentSet.songs.length} tracks • {currentSet.duration}min
          </Badge>
        ) : undefined
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="current" className="flex items-center gap-2">
            <ListMusic className="h-4 w-4" />
            Current Set
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History ({history.length})
          </TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {SET_TEMPLATES.map((template) => (
              <Card
                key={template.id}
                className={`cursor-pointer transition-all hover:border-primary ${
                  selectedTemplate === template.id
                    ? 'border-primary ring-2 ring-primary/20'
                    : ''
                }`}
                onClick={() => setSelectedTemplate(template.id)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-2xl">{template.icon}</span>
                    {template.name}
                  </CardTitle>
                  <CardDescription>{template.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {template.options.duration}min
                    </Badge>
                    <Badge variant="outline">
                      {template.options.intensity}
                    </Badge>
                    <Badge variant="outline">
                      {template.options.energyProfile}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Custom Options */}
          <div className="space-y-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <Settings className="h-4 w-4 mr-2" />
              Custom Options
              {showAdvanced ? (
                <ChevronUp className="h-4 w-4 ml-2" />
              ) : (
                <ChevronDown className="h-4 w-4 ml-2" />
              )}
            </Button>
            {showAdvanced && (
              <Card>
                <CardContent className="pt-6 space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Set Name (optional)</Label>
                      <Input
                        placeholder="My DJ Set"
                        value={setName}
                        onChange={(e) => setSetName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Venue/Event (optional)</Label>
                      <Input
                        placeholder="Club Night, House Party..."
                        value={plannedFor}
                        onChange={(e) => setPlannedFor(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="border-t border-border my-4" />

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Duration: {customOptions.duration} minutes</Label>
                      <Slider
                        value={[customOptions.duration || 60]}
                        onValueChange={([v]) =>
                          setCustomOptions({ ...customOptions, duration: v })
                        }
                        min={15}
                        max={180}
                        step={15}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Energy Profile</Label>
                      <Select
                        value={customOptions.energyProfile}
                        onValueChange={(v) =>
                          setCustomOptions({
                            ...customOptions,
                            energyProfile: v as DJSetPlanningOptions['energyProfile'],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rising">Rising</SelectItem>
                          <SelectItem value="falling">Falling</SelectItem>
                          <SelectItem value="wave">Wave</SelectItem>
                          <SelectItem value="plateau">Plateau</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>BPM Profile</Label>
                      <Select
                        value={customOptions.bpmProfile}
                        onValueChange={(v) =>
                          setCustomOptions({
                            ...customOptions,
                            bpmProfile: v as DJSetPlanningOptions['bpmProfile'],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="steady">Steady</SelectItem>
                          <SelectItem value="gradual_rise">Gradual Rise</SelectItem>
                          <SelectItem value="gradual_fall">Gradual Fall</SelectItem>
                          <SelectItem value="wave">Wave</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Intensity</Label>
                      <Select
                        value={customOptions.intensity}
                        onValueChange={(v) =>
                          setCustomOptions({
                            ...customOptions,
                            intensity: v as DJSetPlanningOptions['intensity'],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="chill">Chill</SelectItem>
                          <SelectItem value="moderate">Moderate</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="peak">Peak</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Transition Style</Label>
                      <Select
                        value={customOptions.transitionStyle}
                        onValueChange={(v) =>
                          setCustomOptions({
                            ...customOptions,
                            transitionStyle: v as DJSetPlanningOptions['transitionStyle'],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="smooth">Smooth</SelectItem>
                          <SelectItem value="dramatic">Dramatic</SelectItem>
                          <SelectItem value="varied">Varied</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>
                        Diversity: {((customOptions.diversity || 0.7) * 100).toFixed(0)}%
                      </Label>
                      <Slider
                        value={[(customOptions.diversity || 0.7) * 100]}
                        onValueChange={([v]) =>
                          setCustomOptions({ ...customOptions, diversity: v / 100 })
                        }
                        min={0}
                        max={100}
                        step={10}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Generate Button */}
          <Button
            size="lg"
            className="w-full"
            onClick={handleGenerateSet}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                {generationProgress || 'Generating...'}
              </>
            ) : (
              <>
                <Wand2 className="h-5 w-5 mr-2" />
                Generate DJ Set
                {selectedTemplate && (
                  <span className="ml-2 opacity-70">
                    ({SET_TEMPLATES.find((t) => t.id === selectedTemplate)?.name})
                  </span>
                )}
              </>
            )}
          </Button>
        </TabsContent>

        {/* Current Set Tab */}
        <TabsContent value="current" className="space-y-6">
          {currentSet ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{currentSet.name}</CardTitle>
                      <CardDescription>{currentSet.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportToNavidrome}
                        disabled={currentSet.exported}
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        {currentSet.exported ? 'Exported' : 'Export to Navidrome'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Statistics */}
                  <div className="grid gap-4 md:grid-cols-4 mb-6">
                    <div className="text-center p-3 rounded-lg bg-muted">
                      <Music className="h-5 w-5 mx-auto mb-1 text-primary" />
                      <div className="text-2xl font-bold">
                        {currentSet.songs.length}
                      </div>
                      <div className="text-xs text-muted-foreground">Tracks</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted">
                      <Clock className="h-5 w-5 mx-auto mb-1 text-primary" />
                      <div className="text-2xl font-bold">
                        {currentSet.duration}
                      </div>
                      <div className="text-xs text-muted-foreground">Minutes</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted">
                      <Activity className="h-5 w-5 mx-auto mb-1 text-primary" />
                      <div className="text-2xl font-bold">
                        {Math.round(currentSet.statistics.averageBPM)}
                      </div>
                      <div className="text-xs text-muted-foreground">Avg BPM</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted">
                      <Zap className="h-5 w-5 mx-auto mb-1 text-primary" />
                      <div className="text-2xl font-bold">
                        {(currentSet.statistics.averageEnergy * 100).toFixed(0)}%
                      </div>
                      <div className="text-xs text-muted-foreground">Energy</div>
                    </div>
                  </div>

                  {/* Track List */}
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {currentSet.songs.map((item, index) => (
                        <div
                          key={item.song.id}
                          className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {item.song.name || item.song.title}
                            </p>
                            <p className="text-sm text-muted-foreground truncate">
                              {item.song.artist}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline">
                              {item.analysis.bpm.toFixed(0)} BPM
                            </Badge>
                            <Badge variant="outline">{item.analysis.key}</Badge>
                            <Badge
                              variant="outline"
                              className={
                                item.analysis.energy > 0.7
                                  ? 'bg-red-500/10'
                                  : item.analysis.energy > 0.4
                                    ? 'bg-yellow-500/10'
                                    : 'bg-green-500/10'
                              }
                            >
                              {(item.analysis.energy * 100).toFixed(0)}%
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  {/* Notes */}
                  {currentSet.notes.length > 0 && (
                    <div className="mt-4 p-4 rounded-lg bg-muted">
                      <h4 className="font-medium mb-2">Set Notes</h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {currentSet.notes.map((note, i) => (
                          <li key={i}>• {note}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <ListMusic className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No Set Generated</h3>
                <p className="text-muted-foreground mb-4">
                  Use the Templates tab to generate a DJ set
                </p>
                <Button onClick={() => setActiveTab('templates')}>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Generate Set
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          {history.length > 0 ? (
            <ScrollArea className="h-[600px]">
              <div className="space-y-4">
                {history.map((set) => (
                  <Card key={set.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{set.name}</CardTitle>
                          <CardDescription>
                            {new Date(set.savedAt).toLocaleDateString()} •{' '}
                            {set.songs.length} tracks • {set.duration}min
                            {set.template && (
                              <Badge variant="outline" className="ml-2">
                                {SET_TEMPLATES.find((t) => t.id === set.template)?.icon}{' '}
                                {SET_TEMPLATES.find((t) => t.id === set.template)?.name}
                              </Badge>
                            )}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          {set.exported && (
                            <Badge variant="secondary">Exported</Badge>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleLoadSet(set)}
                          >
                            Load
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteSet(set.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>
                          <Activity className="h-4 w-4 inline mr-1" />
                          {Math.round(set.statistics.averageBPM)} BPM
                        </span>
                        <span>
                          <Zap className="h-4 w-4 inline mr-1" />
                          {(set.statistics.averageEnergy * 100).toFixed(0)}% energy
                        </span>
                        <span>
                          {set.statistics.keyChanges} key changes
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No Set History</h3>
                <p className="text-muted-foreground">
                  Generated sets will appear here
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
