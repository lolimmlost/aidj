import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard/mood-timeline')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard/analytics', search: { tab: 'mood-timeline' } });
  },
  component: () => null,
});
