import { useState } from "react";
import {
  Users,
  Settings,
  Wifi,
  WifiOff,
  Lightbulb,
  Activity,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CollaboratorsList } from "./CollaboratorsList";
import { SuggestionsQueue } from "./SuggestionsQueue";
import { EnableCollaborationDialog } from "./EnableCollaborationDialog";
import { SuggestSongDialog } from "./SuggestSongDialog";
import {
  useCollaborativePlaylist,
  usePlaylistActivity,
} from "./use-collaborative-playlist";

interface CollaborativePlaylistPanelProps {
  playlistId: string;
  currentUserId: string;
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

function getActivityIcon(type: string) {
  switch (type) {
    case "suggestion_added":
      return Lightbulb;
    case "suggestion_approved":
    case "suggestion_rejected":
    case "vote_cast":
      return Activity;
    case "collaborator_joined":
    case "collaborator_invited":
    case "collaborator_removed":
      return Users;
    default:
      return Activity;
  }
}

function getActivityText(type: string, metadata: Record<string, unknown>): string {
  switch (type) {
    case "suggestion_added":
      return `suggested "${metadata.songTitle}"`;
    case "suggestion_approved":
      return `approved "${metadata.songTitle}"`;
    case "suggestion_rejected":
      return `rejected "${metadata.songTitle}"`;
    case "vote_cast":
      return `voted ${metadata.vote === 1 ? "up" : "down"} on a suggestion`;
    case "collaborator_joined":
      return "joined the playlist";
    case "collaborator_invited":
      return `invited ${metadata.inviteeName}`;
    case "collaborator_removed":
      return "removed a collaborator";
    case "ownership_transferred":
      return "transferred ownership";
    default:
      return type.replace(/_/g, " ");
  }
}

export function CollaborativePlaylistPanel({
  playlistId,
  currentUserId,
}: CollaborativePlaylistPanelProps) {
  const [activeTab, setActiveTab] = useState("suggestions");
  const [isSuggestDialogOpen, setIsSuggestDialogOpen] = useState(false);

  const { collaborationData, isLoading, error, isConnected } =
    useCollaborativePlaylist(playlistId);

  const { data: activityData, isLoading: isActivityLoading } =
    usePlaylistActivity(playlistId, activeTab === "activity");

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-destructive">
        <p>Failed to load collaboration data</p>
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  // If collaboration is not enabled, show enable button
  if (!collaborationData?.settings) {
    return (
      <div className="p-6 text-center">
        <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="font-semibold mb-2">Enable Collaboration</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Turn this into a collaborative playlist where others can suggest and
          vote on songs.
        </p>
        <EnableCollaborationDialog
          playlistId={playlistId}
          trigger={
            <Button>
              <Users className="mr-2 h-4 w-4" />
              Enable Collaboration
            </Button>
          }
        />
      </div>
    );
  }

  const {
    settings,
    collaborators,
    userRole,
    canEdit,
    canSuggest,
  } = collaborationData;

  const onlineCount = collaborators.filter((c) => c.isOnline).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-muted-foreground" />
            )}
            <Badge variant="outline">
              {onlineCount} online
            </Badge>
          </div>
        </div>

        {canEdit && (
          <EnableCollaborationDialog
            playlistId={playlistId}
            trigger={
              <Button variant="ghost" size="icon-sm">
                <Settings className="h-4 w-4" />
              </Button>
            }
          />
        )}
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col"
      >
        <TabsList className="mx-4 mt-4">
          <TabsTrigger value="suggestions" className="flex-1 gap-1">
            <Lightbulb className="h-4 w-4" />
            Suggestions
          </TabsTrigger>
          <TabsTrigger value="collaborators" className="flex-1 gap-1">
            <Users className="h-4 w-4" />
            People
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex-1 gap-1">
            <Activity className="h-4 w-4" />
            Activity
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <TabsContent value="suggestions" className="m-0 p-4">
            <SuggestionsQueue
              playlistId={playlistId}
              userRole={userRole}
              currentUserId={currentUserId}
              autoApproveThreshold={settings.autoApproveThreshold}
              canSuggest={canSuggest}
              onSuggestSong={() => setIsSuggestDialogOpen(true)}
            />
          </TabsContent>

          <TabsContent value="collaborators" className="m-0 p-4">
            <CollaboratorsList
              playlistId={playlistId}
              collaborators={collaborators}
              userRole={userRole}
              shareCode={settings.shareCode}
            />
          </TabsContent>

          <TabsContent value="activity" className="m-0 p-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                <h3 className="font-semibold">Recent Activity</h3>
              </div>

              {isActivityLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              ) : activityData?.activity && activityData.activity.length > 0 ? (
                <div className="space-y-3">
                  {activityData.activity.map((item) => {
                    const Icon = getActivityIcon(item.activityType);
                    const metadata = item.metadata
                      ? JSON.parse(item.metadata)
                      : {};
                    return (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                      >
                        <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">
                            <span className="font-medium">{item.userName}</span>{" "}
                            {getActivityText(item.activityType, metadata)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTimeAgo(item.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No activity yet</p>
                </div>
              )}
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>

      {/* Suggest Song Dialog */}
      <SuggestSongDialog
        playlistId={playlistId}
        isOpen={isSuggestDialogOpen}
        onOpenChange={setIsSuggestDialogOpen}
      />
    </div>
  );
}
