import { createFileRoute, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { DJQueueInterface } from "@/components/dj/dj-queue-interface";
import type { Song } from "@/components/ui/audio-player";

export const Route = createFileRoute("/dj/queue")({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: DJQueuePage,
});

function DJQueuePage() {
  // Mock songs data - in a real implementation, this would come from your library
  const mockSongs: Song[] = [];

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b p-4">
        <div className="container mx-auto flex items-center gap-4">
          <Link to="/dj">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to DJ Features
            </Button>
          </Link>
          <h1 className="text-xl font-bold">DJ Queue Manager</h1>
        </div>
      </div>

      {/* DJ Queue Interface */}
      <div className="pt-20">
        <DJQueueInterface 
          songs={mockSongs}
          onSongSelect={(song) => console.log('Selected song:', song)}
          onSongPlay={(song) => console.log('Playing song:', song)}
        />
      </div>
    </div>
  );
}