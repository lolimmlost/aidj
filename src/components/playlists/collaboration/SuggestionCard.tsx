import { useState } from "react";
import {
  ThumbsUp,
  ThumbsDown,
  Check,
  X,
  Clock,
  Music,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import type { Suggestion, CollaboratorRole } from "./types";
import {
  useVoteOnSuggestion,
  useProcessSuggestion,
  useWithdrawSuggestion,
} from "./use-collaborative-playlist";

interface SuggestionCardProps {
  playlistId: string;
  suggestion: Suggestion;
  userRole: CollaboratorRole | null;
  currentUserId: string;
  autoApproveThreshold?: number | null;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function SuggestionCard({
  playlistId,
  suggestion,
  userRole,
  currentUserId,
  autoApproveThreshold,
}: SuggestionCardProps) {
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const voteMutation = useVoteOnSuggestion();
  const processMutation = useProcessSuggestion();
  const withdrawMutation = useWithdrawSuggestion();

  const canEdit = userRole === "owner" || userRole === "editor";
  const isOwnSuggestion = suggestion.suggestedBy === currentUserId;
  const isPending = suggestion.status === "pending";

  const handleVote = (vote: 1 | -1) => {
    voteMutation.mutate({
      playlistId,
      suggestionId: suggestion.id,
      vote,
    });
  };

  const handleApprove = () => {
    processMutation.mutate({
      playlistId,
      suggestionId: suggestion.id,
      action: "approve",
    });
  };

  const handleReject = () => {
    processMutation.mutate({
      playlistId,
      suggestionId: suggestion.id,
      action: "reject",
      rejectionReason: rejectionReason || undefined,
    });
    setIsRejectDialogOpen(false);
    setRejectionReason("");
  };

  const handleWithdraw = () => {
    withdrawMutation.mutate({
      playlistId,
      suggestionId: suggestion.id,
    });
  };

  // Determine vote button states
  const hasUpvoted = suggestion.userVote === 1;
  const hasDownvoted = suggestion.userVote === -1;

  // Progress towards auto-approval
  const approvalProgress = autoApproveThreshold
    ? Math.min(100, (suggestion.score / autoApproveThreshold) * 100)
    : 0;

  return (
    <div className="group relative p-4 rounded-lg border bg-card hover:shadow-md transition-all">
      {/* Song Info */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded bg-muted flex items-center justify-center shrink-0">
          <Music className="h-6 w-6 text-muted-foreground" />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-medium truncate">{suggestion.songTitle}</h4>
          <p className="text-sm text-muted-foreground truncate">
            {suggestion.songArtist}
            {suggestion.songAlbum && ` • ${suggestion.songAlbum}`}
          </p>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span>Suggested by {suggestion.suggestedByName}</span>
            <span>•</span>
            <Clock className="h-3 w-3" />
            <span>{formatTimeAgo(suggestion.suggestedAt)}</span>
            {suggestion.songDuration && (
              <>
                <span>•</span>
                <span>{formatDuration(suggestion.songDuration)}</span>
              </>
            )}
          </div>
        </div>

        {/* Actions Menu */}
        {(canEdit || isOwnSuggestion) && isPending && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isOwnSuggestion && (
                <DropdownMenuItem
                  onClick={handleWithdraw}
                  className="text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Withdraw
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Voting Section */}
      {isPending && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t">
          <div className="flex items-center gap-2">
            {/* Upvote */}
            <Button
              variant={hasUpvoted ? "default" : "outline"}
              size="sm"
              onClick={() => handleVote(1)}
              disabled={isOwnSuggestion || voteMutation.isPending}
              className="gap-1"
            >
              <ThumbsUp className="h-4 w-4" />
              <span>{suggestion.upvotes}</span>
            </Button>

            {/* Downvote */}
            <Button
              variant={hasDownvoted ? "destructive" : "outline"}
              size="sm"
              onClick={() => handleVote(-1)}
              disabled={isOwnSuggestion || voteMutation.isPending}
              className="gap-1"
            >
              <ThumbsDown className="h-4 w-4" />
              <span>{suggestion.downvotes}</span>
            </Button>

            {/* Score Badge */}
            <Badge
              variant={suggestion.score > 0 ? "default" : suggestion.score < 0 ? "destructive" : "secondary"}
            >
              Score: {suggestion.score > 0 ? "+" : ""}{suggestion.score}
            </Badge>

            {/* Auto-approval progress */}
            {autoApproveThreshold && suggestion.score > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${approvalProgress}%` }}
                  />
                </div>
                <span>{suggestion.score}/{autoApproveThreshold}</span>
              </div>
            )}
          </div>

          {/* Approve/Reject Buttons */}
          {canEdit && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsRejectDialogOpen(true)}
                disabled={processMutation.isPending}
                className="gap-1 text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4" />
                Reject
              </Button>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={processMutation.isPending}
                className="gap-1"
              >
                <Check className="h-4 w-4" />
                Approve
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Status for processed suggestions */}
      {!isPending && (
        <div className="mt-4 pt-3 border-t">
          <Badge
            variant={suggestion.status === "approved" ? "default" : "destructive"}
          >
            {suggestion.status === "approved" ? "Approved" : "Rejected"}
          </Badge>
          {suggestion.rejectionReason && (
            <p className="text-sm text-muted-foreground mt-2">
              Reason: {suggestion.rejectionReason}
            </p>
          )}
        </div>
      )}

      {/* Rejection Dialog */}
      <AlertDialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Suggestion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject "{suggestion.songTitle}" by {suggestion.songArtist}?
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <Textarea
              placeholder="Reason for rejection (optional)"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
