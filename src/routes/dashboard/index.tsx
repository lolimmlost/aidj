import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardIndex,
});

function DashboardIndex() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-2">Music Dashboard</h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          Welcome to your music library. Explore artists, search for songs, and enjoy seamless playback.
        </p>
      </div>

      <pre className="bg-card text-card-foreground rounded-lg border p-4 text-sm opacity-75">
        routes/dashboard/index.tsx
      </pre>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          to="/"
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">Home</h3>
          <p className="text-muted-foreground text-sm">Return to the main page</p>
        </Link>

        <Link
          to="/login"
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">Login</h3>
          <p className="text-muted-foreground text-sm">Sign in to your account</p>
        </Link>

        <Link
          to="/signup"
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">Signup</h3>
          <p className="text-muted-foreground text-sm">Create a new account</p>
        </Link>

        <Link
          to="/config"
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">Service Configuration</h3>
          <p className="text-muted-foreground text-sm">Configure your music service</p>
        </Link>

        <Link
          to="/library/search"
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">Search Library</h3>
          <p className="text-muted-foreground text-sm">Find your favorite songs</p>
        </Link>

        <Link
          to="/library/artists"
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">Browse Artists</h3>
          <p className="text-muted-foreground text-sm">Explore artists and albums</p>
        </Link>

        <Link
          to="/library/artists/id"
          params={{id: '08jJDtStA34urKpsWC7xHt'}}
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">Artist Detail</h3>
          <p className="text-muted-foreground text-sm">View artist information (Example)</p>
        </Link>

        <Link
          to="/library/artists/id/albums/albumId"
          params={{id: '08jJDtStA34urKpsWC7xHt', albumId: '1'}}
          className="card card-hover p-6 text-center block"
        >
          <h3 className="text-lg font-semibold mb-2">Album Detail</h3>
          <p className="text-muted-foreground text-sm">View album tracks (Example)</p>
        </Link>
      </div>
    </div>
  );
}
