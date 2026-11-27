import { createFileRoute, redirect } from "@tanstack/react-router";

// DJ Settings used to repeat Settings › AI DJ word for word, plus Autoplay queueing controls that
// nothing read. Old links and bookmarks land on the one AI DJ settings page.
export const Route = createFileRoute("/dj/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/settings", search: { tab: "ai-dj" } });
  },
});
