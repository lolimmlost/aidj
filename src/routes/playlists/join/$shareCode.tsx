import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2, Users, Music } from "lucide-react";
import { useJoinPlaylist } from "@/components/playlists/collaboration";

export const Route = createFileRoute("/playlists/join/$shareCode")({
  component: JoinPlaylistPage,
});

function JoinPlaylistPage() {
  const { shareCode } = Route.useParams();
  const navigate = useNavigate();
  const joinMutation = useJoinPlaylist();

  useEffect(() => {
    if (shareCode) {
      joinMutation.mutate(shareCode, {
        onSuccess: (data) => {
          // Navigate to the joined playlist
          navigate({
            to: "/playlists/$id",
            params: { id: data.data.playlist.id },
          });
        },
      });
    }
  }, [shareCode]);

  if (joinMutation.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <h1 className="text-2xl font-bold">Joining Playlist...</h1>
          <p className="text-muted-foreground">Please wait while we add you to the playlist</p>
        </div>
      </div>
    );
  }

  if (joinMutation.isError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <Users className="h-12 w-12 mx-auto text-destructive" />
          <h1 className="text-2xl font-bold">Unable to Join</h1>
          <p className="text-muted-foreground">
            {joinMutation.error instanceof Error
              ? joinMutation.error.message
              : "Invalid or expired share link"}
          </p>
          <button
            onClick={() => navigate({ to: "/playlists" })}
            className="text-primary hover:underline"
          >
            Go to My Playlists
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <Music className="h-12 w-12 mx-auto text-muted-foreground" />
        <h1 className="text-2xl font-bold">Ready to Join</h1>
        <p className="text-muted-foreground">Click below to join this collaborative playlist</p>
      </div>
    </div>
  );
}
