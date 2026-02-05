import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { SubsonicSong } from '@/lib/services/navidrome';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, X, Plus, Eye, Loader2 } from 'lucide-react';

// Simple UUID generator for browser compatibility
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Navidrome Smart Playlist Rule Types - full .nsp field set
type Field =
  | 'title' | 'album' | 'artist' | 'genre' | 'filepath'
  | 'playcount' | 'rating' | 'duration' | 'bitrate' | 'bpm'
  | 'dateadded' | 'lastplayed' | 'dateloved'
  | 'loved'
  | 'year'
  | 'inPlaylist' | 'notInPlaylist';

type Operator =
  | 'is' | 'isNot' | 'gt' | 'lt' | 'contains' | 'notContains'
  | 'startsWith' | 'endsWith' | 'inTheRange' | 'before' | 'after'
  | 'inTheLast' | 'notInTheLast';

interface Rule {
  id: string;
  operator: Operator;
  field: Field;
  value: string | number | boolean | [number, number];
}

interface SmartPlaylistRules {
  name: string;
  comment?: string;
  all?: Array<Record<string, unknown>>;
  any?: Array<Record<string, unknown>>;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
}

interface PresetTemplate {
  id: string;
  name: string;
  description: string;
  category: 'popular' | 'discovery' | 'time' | 'stats';
  rules: SmartPlaylistRules;
}

const PRESETS: PresetTemplate[] = [
  // Popular
  {
    id: 'loved',
    name: 'Loved Songs',
    description: 'All your starred/loved songs',
    category: 'popular',
    rules: {
      name: 'Loved Songs',
      all: [{ is: { loved: true } }],
      sort: '-dateloved',
    },
  },
  {
    id: 'recent-favourites',
    name: 'Recent Favourites',
    description: 'Loved songs played in the last 30 days',
    category: 'popular',
    rules: {
      name: 'Recent Favourites',
      all: [
        { is: { loved: true } },
        { inTheLast: { lastplayed: 30 } },
      ],
    },
  },
  {
    id: 'highly-rated',
    name: 'Highly Rated',
    description: 'Songs rated 4+ stars',
    category: 'popular',
    rules: {
      name: 'Highly Rated',
      all: [{ gt: { rating: 3 } }],
      sort: '-rating',
    },
  },
  {
    id: 'most-played',
    name: 'Most Played',
    description: 'Your top played songs (5+ plays)',
    category: 'stats',
    rules: {
      name: 'Most Played',
      all: [{ gt: { playcount: 5 } }],
      sort: '-playcount',
      limit: 50,
    },
  },
  // Discovery
  {
    id: 'forgotten-gems',
    name: 'Forgotten Gems',
    description: 'Rarely played songs added over 6 months ago',
    category: 'discovery',
    rules: {
      name: 'Forgotten Gems',
      all: [
        { lt: { playcount: 3 } },
        { notInTheLast: { dateadded: 180 } },
      ],
      sort: 'random',
      limit: 30,
    },
  },
  {
    id: 'never-played',
    name: 'Never Played',
    description: 'Discover songs you have not played yet',
    category: 'discovery',
    rules: {
      name: 'Never Played',
      all: [{ is: { playcount: 0 } }],
      sort: 'random',
      limit: 50,
    },
  },
  {
    id: 'random-mix',
    name: 'Random Mix',
    description: 'A random selection of 50 songs',
    category: 'discovery',
    rules: {
      name: 'Random Mix',
      all: [],
      sort: 'random',
      limit: 50,
    },
  },
  // Time-based
  {
    id: 'recently-added',
    name: 'Recently Added',
    description: 'Songs added in the last 30 days',
    category: 'time',
    rules: {
      name: 'Recently Added',
      all: [{ inTheLast: { dateadded: 30 } }],
      sort: '-dateadded',
      limit: 50,
    },
  },
  {
    id: 'recently-played',
    name: 'Recently Played',
    description: 'Songs played in the last 30 days',
    category: 'time',
    rules: {
      name: 'Recently Played',
      all: [{ inTheLast: { lastplayed: 30 } }],
      sort: '-lastplayed',
      limit: 100,
    },
  },
  {
    id: 'classic-hits',
    name: '80s & 90s Classics',
    description: 'Songs from the 1980s and 1990s',
    category: 'time',
    rules: {
      name: 'Classic Hits',
      all: [{ inTheRange: { year: [1980, 1999] } }],
      sort: 'random',
      limit: 100,
    },
  },
  {
    id: 'recent-releases',
    name: 'Recent Releases',
    description: 'Songs from the last 3 years',
    category: 'time',
    rules: {
      name: 'Recent Releases',
      all: [{ gt: { year: new Date().getFullYear() - 3 } }],
      sort: '-year',
      limit: 100,
    },
  },
  // Stats-based
  {
    id: 'long-tracks',
    name: 'Long Tracks',
    description: 'Songs over 5 minutes — perfect for deep listening',
    category: 'stats',
    rules: {
      name: 'Long Tracks',
      all: [{ gt: { duration: 300 } }],
      sort: '-duration',
      limit: 50,
    },
  },
  {
    id: 'short-tracks',
    name: 'Short & Sweet',
    description: 'Quick songs under 3 minutes',
    category: 'stats',
    rules: {
      name: 'Short Tracks',
      all: [{ lt: { duration: 180 } }],
      sort: 'random',
      limit: 100,
    },
  },
  {
    id: 'unrated',
    name: 'Unrated Songs',
    description: 'Songs without a rating — help organize your library',
    category: 'stats',
    rules: {
      name: 'Unrated Songs',
      all: [{ lt: { rating: 1 } }],
      sort: 'artist',
      order: 'asc',
      limit: 200,
    },
  },
];

// Grouped field options for the custom rules builder
interface FieldOption {
  value: Field;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'playlist';
  group: 'Song Info' | 'Stats' | 'Dates' | 'Status' | 'Advanced';
}

const FIELD_OPTIONS: FieldOption[] = [
  // Song Info
  { value: 'title', label: 'Title', type: 'string', group: 'Song Info' },
  { value: 'album', label: 'Album', type: 'string', group: 'Song Info' },
  { value: 'artist', label: 'Artist', type: 'string', group: 'Song Info' },
  { value: 'genre', label: 'Genre', type: 'string', group: 'Song Info' },
  { value: 'filepath', label: 'File Path', type: 'string', group: 'Song Info' },
  // Stats
  { value: 'playcount', label: 'Play Count', type: 'number', group: 'Stats' },
  { value: 'rating', label: 'Rating (1-5)', type: 'number', group: 'Stats' },
  { value: 'duration', label: 'Duration (sec)', type: 'number', group: 'Stats' },
  { value: 'bitrate', label: 'Bitrate', type: 'number', group: 'Stats' },
  { value: 'bpm', label: 'BPM', type: 'number', group: 'Stats' },
  { value: 'year', label: 'Year', type: 'number', group: 'Stats' },
  // Dates
  { value: 'dateadded', label: 'Date Added', type: 'date', group: 'Dates' },
  { value: 'lastplayed', label: 'Last Played', type: 'date', group: 'Dates' },
  { value: 'dateloved', label: 'Date Loved', type: 'date', group: 'Dates' },
  // Status
  { value: 'loved', label: 'Loved', type: 'boolean', group: 'Status' },
  // Advanced
  { value: 'inPlaylist', label: 'In Playlist', type: 'playlist', group: 'Advanced' },
  { value: 'notInPlaylist', label: 'Not In Playlist', type: 'playlist', group: 'Advanced' },
];

const FIELD_GROUPS = ['Song Info', 'Stats', 'Dates', 'Status', 'Advanced'] as const;

const OPERATOR_OPTIONS: Record<string, { value: Operator; label: string }[]> = {
  string: [
    { value: 'is', label: 'is' },
    { value: 'isNot', label: 'is not' },
    { value: 'contains', label: 'contains' },
    { value: 'notContains', label: 'does not contain' },
    { value: 'startsWith', label: 'starts with' },
    { value: 'endsWith', label: 'ends with' },
  ],
  number: [
    { value: 'is', label: 'equals' },
    { value: 'isNot', label: 'not equals' },
    { value: 'gt', label: 'greater than' },
    { value: 'lt', label: 'less than' },
    { value: 'inTheRange', label: 'in range' },
  ],
  boolean: [
    { value: 'is', label: 'is' },
  ],
  date: [
    { value: 'inTheLast', label: 'in the last (days)' },
    { value: 'notInTheLast', label: 'not in the last (days)' },
    { value: 'before', label: 'before' },
    { value: 'after', label: 'after' },
  ],
  playlist: [
    { value: 'is', label: 'is' },
  ],
};

const DATE_QUICK_VALUES = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '180 days', value: 180 },
  { label: '1 year', value: 365 },
];

const PRESET_CATEGORIES: { key: PresetTemplate['category']; label: string }[] = [
  { key: 'popular', label: 'Favourites' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'time', label: 'Time-Based' },
  { key: 'stats', label: 'Library Stats' },
];

interface SmartPlaylistEditorProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SmartPlaylistEditor({
  trigger,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}: SmartPlaylistEditorProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange || setInternalOpen;

  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets');
  const [name, setName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [sortField, setSortField] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState<number>(100);

  const queryClient = useQueryClient();

  // Preview query
  const { data: previewData, isLoading: isLoadingPreview, refetch: refetchPreview } = useQuery({
    queryKey: ['smart-playlist-preview', rules, sortField, sortOrder, limit],
    queryFn: async () => {
      const playlistRules = buildPlaylistRules();
      const response = await fetch('/api/playlists/smart/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: playlistRules }),
      });

      if (!response.ok) {
        throw new Error('Failed to preview playlist');
      }

      return response.json();
    },
    enabled: false,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; rules: SmartPlaylistRules }) => {
      const response = await fetch('/api/playlists/smart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create smart playlist');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      toast.success('Smart playlist created successfully');
      resetForm();
      setOpen(false);
    },
    onError: (error: Error) => {
      toast.error('Failed to create smart playlist', {
        description: error.message,
      });
    },
  });

  const resetForm = () => {
    setName('');
    setSelectedPreset(null);
    setRules([]);
    setSortField('');
    setSortOrder('desc');
    setLimit(100);
    setActiveTab('presets');
  };

  const addRule = () => {
    setRules([...rules, {
      id: generateId(),
      operator: 'is' as Operator,
      field: 'title' as Field,
      value: '',
    }]);
  };

  const removeRule = (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
  };

  const updateRule = (id: string, updates: Partial<Rule>) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const loadPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    setSelectedPreset(presetId);
    setName(preset.rules.name);
    setSortField(preset.rules.sort || '');
    setSortOrder(preset.rules.order || 'desc');
    setLimit(preset.rules.limit || 100);
    setRules([]);
  };

  const buildPlaylistRules = (): SmartPlaylistRules => {
    if (selectedPreset && activeTab === 'presets') {
      const preset = PRESETS.find((p) => p.id === selectedPreset);
      if (preset) {
        return { ...preset.rules, name };
      }
    }

    const allConditions = rules.map((rule) => ({
      [rule.operator]: { [rule.field]: rule.value },
    }));

    return {
      name,
      all: allConditions.length > 0 ? allConditions : undefined,
      sort: sortField || undefined,
      order: sortOrder,
      limit,
    };
  };

  const handlePreview = () => {
    refetchPreview();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Please enter a playlist name');
      return;
    }

    const playlistRules = buildPlaylistRules();
    createMutation.mutate({ name: name.trim(), rules: playlistRules });
  };

  const getFieldType = (field: Field): string => {
    return FIELD_OPTIONS.find((f) => f.value === field)?.type || 'string';
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="min-h-[44px]">
            <Sparkles className="mr-2 h-4 w-4" />
            New Smart Playlist
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Create Smart Playlist</DialogTitle>
            <DialogDescription>
              Build dynamic playlists using Navidrome's rule engine. Pick a preset or create custom rules.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'presets' | 'custom')} className="flex flex-col">
              <TabsList className="grid w-full grid-cols-2 sticky top-0 bg-background z-10">
                <TabsTrigger value="presets">Presets</TabsTrigger>
                <TabsTrigger value="custom">Custom Rules</TabsTrigger>
              </TabsList>

              <div className="mt-4">
                <TabsContent value="presets" className="mt-0">
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="preset-name">Playlist Name</Label>
                      <Input
                        id="preset-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter playlist name"
                        className="min-h-[44px]"
                        required
                      />
                    </div>

                    {/* Grouped presets */}
                    <div className="space-y-4">
                      {PRESET_CATEGORIES.map(({ key, label }) => {
                        const categoryPresets = PRESETS.filter(p => p.category === key);
                        if (categoryPresets.length === 0) return null;
                        return (
                          <div key={key} className="space-y-2">
                            <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
                            <div className="grid gap-2">
                              {categoryPresets.map((preset) => (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() => loadPreset(preset.id)}
                                  className={`p-3 border rounded-lg text-left transition-colors hover:bg-accent ${
                                    selectedPreset === preset.id ? 'border-primary bg-primary/5' : ''
                                  }`}
                                >
                                  <div className="font-semibold text-sm">{preset.name}</div>
                                  <div className="text-xs text-muted-foreground">{preset.description}</div>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="custom" className="mt-0">
                  <div className="space-y-6">
                    <div className="grid gap-2">
                      <Label htmlFor="custom-name">Playlist Name</Label>
                      <Input
                        id="custom-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter playlist name"
                        className="min-h-[44px]"
                        required
                      />
                    </div>

                    {/* Rules Section */}
                    <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-base font-semibold">Rules</Label>
                          <p className="text-sm text-muted-foreground mt-1">Add conditions to filter songs</p>
                        </div>
                        <Button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); addRule(); }}
                          variant="default"
                          size="sm"
                          className="min-h-[40px]"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Rule
                        </Button>
                      </div>

                      {rules.length === 0 && (
                        <div className="text-sm text-muted-foreground text-center py-12 border-2 border-dashed rounded-lg bg-background">
                          <Plus className="h-8 w-8 mx-auto mb-3 opacity-50" />
                          <p className="font-medium mb-1">No rules yet</p>
                          <p className="text-xs">Click "Add Rule" above to start building your smart playlist</p>
                        </div>
                      )}

                      {rules.map((rule) => (
                        <div key={rule.id} className="flex gap-2 items-start p-3 border rounded-lg bg-background">
                          <div className="flex-1 grid grid-cols-3 gap-2">
                            {/* Field selector - grouped */}
                            <Select
                              value={rule.field}
                              onValueChange={(value) => {
                                const newType = FIELD_OPTIONS.find(f => f.value === value)?.type;
                                const oldType = getFieldType(rule.field);
                                const updates: Partial<Rule> = { field: value as Field };
                                // Reset value and operator when field type changes
                                if (newType !== oldType) {
                                  updates.value = newType === 'boolean' ? true : '';
                                  updates.operator = newType === 'date' ? 'inTheLast' : 'is';
                                }
                                updateRule(rule.id, updates);
                              }}
                            >
                              <SelectTrigger className="min-h-[44px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FIELD_GROUPS.map((group) => {
                                  const fields = FIELD_OPTIONS.filter(f => f.group === group);
                                  return (
                                    <SelectGroup key={group}>
                                      <SelectLabel>{group}</SelectLabel>
                                      {fields.map((field) => (
                                        <SelectItem key={field.value} value={field.value}>
                                          {field.label}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  );
                                })}
                              </SelectContent>
                            </Select>

                            {/* Operator selector */}
                            <Select
                              value={rule.operator}
                              onValueChange={(value) => updateRule(rule.id, { operator: value as Operator })}
                            >
                              <SelectTrigger className="min-h-[44px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {OPERATOR_OPTIONS[getFieldType(rule.field)]?.map((op) => (
                                  <SelectItem key={op.value} value={op.value}>
                                    {op.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {/* Value input - context-dependent */}
                            {getFieldType(rule.field) === 'boolean' ? (
                              <Select
                                value={String(rule.value)}
                                onValueChange={(value) => updateRule(rule.id, { value: value === 'true' })}
                              >
                                <SelectTrigger className="min-h-[44px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="true">Yes</SelectItem>
                                  <SelectItem value="false">No</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : getFieldType(rule.field) === 'date' && (rule.operator === 'inTheLast' || rule.operator === 'notInTheLast') ? (
                              <Select
                                value={String(rule.value || 30)}
                                onValueChange={(value) => updateRule(rule.id, { value: Number(value) })}
                              >
                                <SelectTrigger className="min-h-[44px]">
                                  <SelectValue placeholder="Select period" />
                                </SelectTrigger>
                                <SelectContent>
                                  {DATE_QUICK_VALUES.map((qv) => (
                                    <SelectItem key={qv.value} value={String(qv.value)}>
                                      {qv.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                type={getFieldType(rule.field) === 'number' ? 'number' : 'text'}
                                value={rule.value as string | number}
                                onChange={(e) =>
                                  updateRule(rule.id, {
                                    value: getFieldType(rule.field) === 'number' ? Number(e.target.value) : e.target.value,
                                  })
                                }
                                placeholder={getFieldType(rule.field) === 'playlist' ? 'Playlist name' : 'Value'}
                                className="min-h-[44px]"
                              />
                            )}
                          </div>

                          <Button
                            type="button"
                            onClick={() => removeRule(rule.id)}
                            variant="ghost"
                            size="icon"
                            className="min-h-[44px] min-w-[44px]"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    {/* Sorting and Limits Section */}
                    <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                      <Label className="text-base font-semibold">Sorting & Limits</Label>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="sort">Sort By</Label>
                          <Select value={sortField || 'default'} onValueChange={(v) => setSortField(v === 'default' ? '' : v)}>
                            <SelectTrigger id="sort" className="min-h-[44px]">
                              <SelectValue placeholder="Default" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">Default</SelectItem>
                              <SelectItem value="random">Random</SelectItem>
                              {FIELD_OPTIONS.filter(f => f.group !== 'Advanced').map((field) => (
                                <SelectItem key={field.value} value={field.value}>
                                  {field.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="order">Order</Label>
                          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as 'asc' | 'desc')}>
                            <SelectTrigger id="order" className="min-h-[44px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="asc">Ascending</SelectItem>
                              <SelectItem value="desc">Descending</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="limit">Limit</Label>
                          <Input
                            id="limit"
                            type="number"
                            value={limit}
                            onChange={(e) => setLimit(Number(e.target.value))}
                            min={1}
                            max={1000}
                            className="min-h-[44px]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            {/* Preview Section */}
            {previewData && (
              <div className="mt-4 p-4 border rounded-lg bg-muted/50 max-h-48 overflow-hidden flex flex-col">
                <div className="font-semibold mb-2 flex-shrink-0">
                  Preview: {previewData.data?.songs?.length || 0} songs matched
                </div>
                <div className="overflow-y-auto flex-1 pr-2">
                  <div className="space-y-1 text-sm">
                    {previewData.data?.songs?.slice(0, 20).map((song: SubsonicSong) => (
                      <div key={song.id} className="text-muted-foreground">
                        {song.artist} - {song.title}
                      </div>
                    ))}
                    {(previewData.data?.songs?.length || 0) > 20 && (
                      <div className="text-muted-foreground italic py-2">
                        ...and {previewData.data.songs.length - 20} more
                      </div>
                    )}
                    {(previewData.data?.songs?.length || 0) === 0 && (
                      <div className="text-muted-foreground italic py-4 text-center">
                        No songs match these criteria. Try adjusting your rules.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4 flex-shrink-0 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handlePreview}
              disabled={isLoadingPreview || (!selectedPreset && rules.length === 0)}
              className="min-h-[44px]"
            >
              {isLoadingPreview ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Eye className="mr-2 h-4 w-4" />
                  Preview
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                setOpen(false);
              }}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !name.trim()}
              className="min-h-[44px]"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Playlist'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
