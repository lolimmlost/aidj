import { createFileRoute, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/dj/energy-analyzer")({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: EnergyAnalyzerPage,
});

function EnergyAnalyzerPage() {
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
          <h1 className="text-2xl font-bold">Energy Flow Analyzer</h1>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6">
        <div className="text-center p-8 bg-muted/50 rounded-lg">
          <div className="mb-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-9-12"/>
                <path d="M3 14l9 7"/>
                <path d="M22 12l-9-12"/>
                <path d="M3 14l9 7"/>
              </svg>
            </div>
            <h3 className="text-xl font-semibold">Energy Flow Analyzer</h3>
            <p className="text-muted-foreground">Coming Soon</p>
          </div>
          <p className="text-muted-foreground max-w-md">
            Visualize energy flow between tracks to identify optimal transition points. 
            This feature analyzes the energy levels of your songs and helps create seamless transitions.
          </p>
        </div>
      </div>
    </div>
  );
}