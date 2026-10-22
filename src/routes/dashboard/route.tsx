import { createFileRoute, Outlet } from "@tanstack/react-router";
import { loginRedirect } from "~/lib/auth/login-redirect";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
  beforeLoad: async ({ context, location }) => {
    if (!context.user) {
      throw loginRedirect(location);
    }
  },
});

function DashboardLayout() {
  return <Outlet />;
}
