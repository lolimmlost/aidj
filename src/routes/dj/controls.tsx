import { createFileRoute, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { DJControls } from "@/components/dj/dj-controls";

export const Route = createFileRoute("/dj/controls")({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: DJControlsPage,
});

function DJControlsPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/dj">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to DJ Features
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">DJ Controls</h1>
        </div>
      </div>

      {/* DJ Controls Component */}
      <DJControls />
    </div>
  );
}