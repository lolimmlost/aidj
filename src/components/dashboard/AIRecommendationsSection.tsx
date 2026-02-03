import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { VirtualizedList } from '@/components/ui/virtualized-list';
import { OllamaErrorBoundary } from '@/components/ollama-error-boundary';
import { RecommendationCard } from '@/components/recommendations/RecommendationCard';
import { ChevronDown, ChevronUp, RefreshCw, Sparkles } from 'lucide-react';
import type { Song } from '@/lib/types/song';

type CachedSong = Song & { trackNumber?: number };

interface RecommendationItem {
  song: string;
  foundInLibrary?: boolean;
  actualSong?: CachedSong;
  searchError?: boolean;
  explanation?: string;
}

interface AIRecommendationsSectionProps {
  show: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  type: 'similar' | 'mood';
  onTypeChange: (type: 'similar' | 'mood') => void;
  isLoading: boolean;
  error: Error | null;
  recommendations:
    | {
        data: { recommendations: RecommendationItem[] };
        timestamp: string;
      }
    | undefined;
  onRefresh: () => void;
  songFeedback: Record<string, 'thumbs_up' | 'thumbs_down' | null>;
  onFeedback: (params: {
    song: string;
    feedbackType: 'thumbs_up' | 'thumbs_down';
    songId?: string;
  }) => void;
  isFeedbackPending: boolean;
  onQueueAction: (song: string, position: 'now' | 'next' | 'end') => void;
}

export function AIRecommendationsSection({
  show,
  collapsed,
  onToggleCollapse,
  type,
  onTypeChange,
  isLoading,
  error,
  recommendations,
  onRefresh,
  songFeedback,
  onFeedback,
  isFeedbackPending,
  onQueueAction,
}: AIRecommendationsSectionProps) {
  if (!show) return null;

  return (
    <OllamaErrorBoundary>
      <section className="glass-card-premium p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <button
            onClick={onToggleCollapse}
            className="flex items-center gap-3 text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                <span className="text-gradient-brand">AI Recommendations</span>
                <span className="badge-purple text-[10px]">AI</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Personalized picks based on your taste
              </p>
            </div>
            {collapsed ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors ml-1" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors ml-1" />
            )}
          </button>
          {!collapsed && (
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isLoading}
                className="flex-1 sm:flex-none min-h-[44px] hover:bg-primary/5 hover:border-primary/50 transition-all rounded-xl"
                aria-label="Refresh recommendations"
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
                />
                {isLoading ? 'Loading...' : 'Refresh'}
              </Button>
              <Select
                value={type}
                onValueChange={(value) =>
                  onTypeChange(value as 'similar' | 'mood')
                }
              >
                <SelectTrigger className="w-full sm:w-[180px] min-h-[44px] rounded-xl">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="similar">Similar Artists</SelectItem>
                  <SelectItem value="mood">Mood-Based</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {collapsed && (
          <p className="text-sm text-muted-foreground pl-[52px]">
            Tap to explore personalized recommendations
          </p>
        )}

        {!collapsed && (
          <>
            {isLoading && (
              <Card className="bg-card text-card-foreground border-card">
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-64 mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[...Array(5)].map((_, index) => (
                      <div key={index} className="p-2 border rounded space-y-2">
                        <div className="flex justify-between items-center">
                          <Skeleton className="h-5 w-3/4" />
                          <Skeleton className="h-8 w-20" />
                        </div>
                        <Skeleton className="h-4 w-full" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {error && (
              <p className="text-destructive">
                Error loading recommendations: {error.message}
                {error.message.includes('rate limit') && (
                  <span className="block text-sm mt-1">
                    Please wait a moment before refreshing again
                  </span>
                )}
              </p>
            )}

            {recommendations && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-500/5 to-pink-500/5 border border-purple-500/10 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-purple-600"
                      >
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Based on your listening history
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {
                          recommendations.data.recommendations.filter(
                            (rec) => rec.foundInLibrary,
                          ).length
                        }{' '}
                        of {recommendations.data.recommendations.length} songs in
                        your library &bull; Updated{' '}
                        {new Date(recommendations.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>

                <VirtualizedList
                  items={recommendations.data.recommendations}
                  itemHeight={140}
                  containerHeight={Math.min(
                    500,
                    Math.max(
                      280,
                      recommendations.data.recommendations.length * 140,
                    ),
                  )}
                  getItemKey={(rec: RecommendationItem) => rec.song}
                  gap={12}
                  overscan={3}
                  className="rounded-lg"
                  renderItem={(rec: RecommendationItem, index: number) => {
                    const currentFeedback = songFeedback[rec.song];
                    const hasFeedback =
                      currentFeedback !== undefined && currentFeedback !== null;

                    return (
                      <RecommendationCard
                        key={rec.song}
                        rec={rec}
                        index={index}
                        currentFeedback={currentFeedback}
                        hasFeedback={hasFeedback}
                        onFeedback={(feedbackType) =>
                          onFeedback({
                            song: rec.song,
                            feedbackType,
                            songId: rec.actualSong?.id,
                          })
                        }
                        onQueueAction={(position) =>
                          onQueueAction(rec.song, position)
                        }
                        isPending={isFeedbackPending}
                      />
                    );
                  }}
                />
              </div>
            )}
          </>
        )}
      </section>
    </OllamaErrorBoundary>
  );
}
