import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ChevronRight, Disc, ListMusic, Settings, Wand2 } from "lucide-react";
import { loginRedirect } from "~/lib/auth/login-redirect";
import { Card } from "@/components/ui/card";
import { PageLayout } from "@/components/ui/page-layout";
import { AIDJToggle } from "@/components/ai-dj-toggle";
import { LabHero } from "@/components/dj-lab/LabHero";

export const Route = createFileRoute("/dj/")({
  beforeLoad: async ({ context, location }) => {
    if (!context.user) {
      throw loginRedirect(location);
    }
  },
  component: DJIndex,
});

/** One row per DJ tool: icon, name, one line, chevron. */
function ToolRow({ to, icon, title, line }: { to: "/dj/set-builder" | "/dj/settings"; icon: ReactNode; title: string; line: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-primary">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{line}</div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function DJIndex() {
  const { user } = Route.useRouteContext();
  return (
    <PageLayout title="DJ" icon={<Disc className="h-5 w-5" />} backLink="" compact>
      <div className="mx-auto max-w-3xl space-y-3">
        {/* the Lab is admin-only while it's a prototype (#345) */}
        {user?.role === "admin" && <LabHero />}

        <Card className="p-3 sm:p-4">
          <AIDJToggle />
        </Card>

        <Card className="divide-y overflow-hidden p-0">
          <ToolRow to="/dj/set-builder" icon={<ListMusic className="size-4" />} title="Set Builder" line="Plan a set: energy curve, BPM path, export as a playlist" />
          <ToolRow to="/dj/settings" icon={<Settings className="size-4" />} title="DJ Settings" line="Crossfades, AI DJ batch size, autoplay" />
        </Card>

        <details className="group rounded-xl border px-3 py-2.5 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground [&::-webkit-details-marker]:hidden">
            <Wand2 className="size-4 text-primary" />
            Tips
            <ChevronRight className="ml-auto size-4 transition-transform group-open:rotate-90" />
          </summary>
          <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">AI DJ</span> keeps the queue going with songs that fit what's playing. Thumbs in the
              queue panel teach it.
            </li>
            <li>
              <span className="font-medium text-foreground">Smart transitions</span> (DJ Settings) time crossfades to each pair of songs.
            </li>
            <li>
              <span className="font-medium text-foreground">BPM and key badges</span> on recommendations show which songs mix well.
            </li>
          </ul>
        </details>
      </div>
    </PageLayout>
  );
}
