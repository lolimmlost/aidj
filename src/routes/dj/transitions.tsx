import { createFileRoute } from '@tanstack/react-router';
import { Shuffle } from 'lucide-react';
import { loginRedirect } from '~/lib/auth/login-redirect';
import { PageLayout } from '@/components/ui/page-layout';
import { KnownTransitions } from '@/components/dj-lab/KnownTransitions';

export const Route = createFileRoute('/dj/transitions')({
  beforeLoad: async ({ context, location }) => {
    if (!context.user) throw loginRedirect(location);
  },
  component: KnownTransitionsPage,
});

function KnownTransitionsPage() {
  const { user } = Route.useRouteContext();
  return (
    <PageLayout title="Known transitions" icon={<Shuffle className="h-5 w-5" />} backLink="/dj" backLabel="DJ" compact>
      {/* importing reads the saved Lab sets, which are admin-only like the Lab (#345) */}
      <KnownTransitions canImport={user?.role === 'admin'} />
    </PageLayout>
  );
}
