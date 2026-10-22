import { createFileRoute, Outlet } from '@tanstack/react-router';
import { loginRedirect } from '~/lib/auth/login-redirect';

export const Route = createFileRoute('/library/artists')({
  beforeLoad: async ({ context, location }) => {
    if (!context.user) {
      throw loginRedirect(location);
    }
  },
  loader: async () => {
    return {};
  },
  component: ArtistsLayout,
});

function ArtistsLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
    </div>
  );
}
