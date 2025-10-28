import { createFileRoute, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Disc } from "lucide-react";
import { DJFeatureCards } from "@/components/dj/dj-feature-cards";

export const Route = createFileRoute("/dj/")({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: DJIndex,
});

function DJIndex() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/dashboard">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Disc className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">DJ Features</h1>
          </div>
        </div>
      </div>

      {/* DJ Feature Cards */}
      <DJFeatureCards />
    </div>
  );
}