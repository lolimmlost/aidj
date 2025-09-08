import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardIndex,
});

function DashboardIndex() {
  return (
    <div className="flex flex-col items-center gap-1">
      Dashboard index page
      <pre className="bg-card text-card-foreground rounded-md border p-1">
        routes/dashboard/index.tsx
      </pre>
      <div className="mt-2 space-y-2">
        <Link to="/" className="underline">Home</Link>
        <Link to="/login" className="underline">Login</Link>
        <Link to="/signup" className="underline">Signup</Link>
        <Link to="/config" className="underline">Service Configuration</Link>
        <Link to="/dashboard" className="underline">Dashboard</Link>
        <Link to="/library/search" className="underline">Search Library</Link>
        <Link to="/library/artists" className="underline">Browse Artists</Link>
        <Link to="/library/artists/id" params={{id: '08jJDtStA34urKpsWC7xHt'}} className="underline">Artist Detail (Example)</Link>
        <Link to="/library/artists/id/albums/albumId" params={{id: '08jJDtStA34urKpsWC7xHt', albumId: '1'}} className="underline">Album Detail (Example)</Link>
      </div>
    </div>
  );
}
