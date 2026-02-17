import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard/discovery-analytics')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard/analytics', search: { tab: 'discovery' } });
  },
  component: () => null,
});
