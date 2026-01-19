import { useState } from "react";
import {
  Lightbulb,
  ArrowUpDown,
  Clock,
  TrendingUp,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SuggestionCard } from "./SuggestionCard";
import { useSuggestions } from "./use-collaborative-playlist";
import type { CollaboratorRole, SuggestionStatus } from "./types";

interface SuggestionsQueueProps {
  playlistId: string;
  userRole: CollaboratorRole | null;
  currentUserId: string;
  autoApproveThreshold?: number | null;
  canSuggest: boolean;
  onSuggestSong?: () => void;
}

type SortBy = "score" | "date";

export function SuggestionsQueue({
  playlistId,
  userRole,
  currentUserId,
  autoApproveThreshold,
  canSuggest,
  onSuggestSong,
}: SuggestionsQueueProps) {
  const [status, setStatus] = useState<SuggestionStatus>("pending");
  const [sortBy, setSortBy] = useState<SortBy>("score");

  const { data, isLoading, error } = useSuggestions(playlistId, {
    status,
    sortBy,
  });

  const suggestions = data?.suggestions ?? [];
  const total = data?.total ?? 0;

  if (error) {
    return (
      <div className="p-6 text-center text-destructive">
        <p>Failed to load suggestions</p>
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5" />
          <h3 className="font-semibold">Song Suggestions</h3>
          {status === "pending" && total > 0 && (
            <Badge variant="secondary">{total}</Badge>
          )}
        </div>

        {canSuggest && onSuggestSong && (
          <Button onClick={onSuggestSong} size="sm" className="gap-1">
            <Lightbulb className="h-4 w-4" />
            Suggest a Song
          </Button>
        )}
      </div>

      {/* Tabs & Sort */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs
          value={status}
          onValueChange={(v) => setStatus(v as SuggestionStatus)}
        >
          <TabsList>
            <TabsTrigger value="pending" className="gap-1">
              <Clock className="h-4 w-4" />
              Pending
            </TabsTrigger>
            <TabsTrigger value="approved" className="gap-1">
              <Check className="h-4 w-4" />
              Approved
            </TabsTrigger>
            <TabsTrigger value="rejected" className="gap-1">
              <X className="h-4 w-4" />
              Rejected
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {status === "pending" && (
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="w-[140px]">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  <span>Top Voted</span>
                </div>
              </SelectItem>
              <SelectItem value="date">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>Most Recent</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Suggestions List */}
      <div className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </>
        ) : suggestions.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Lightbulb className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No {status} suggestions</p>
            {status === "pending" && canSuggest && (
              <p className="text-sm mt-1">Be the first to suggest a song!</p>
            )}
          </div>
        ) : (
          suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              playlistId={playlistId}
              suggestion={suggestion}
              userRole={userRole}
              currentUserId={currentUserId}
              autoApproveThreshold={autoApproveThreshold}
            />
          ))
        )}
      </div>

      {/* Auto-approval info */}
      {status === "pending" && autoApproveThreshold && (
        <div className="text-xs text-muted-foreground text-center py-2 border-t">
          Songs are automatically approved when they reach +{autoApproveThreshold} votes
        </div>
      )}
    </div>
  );
}
