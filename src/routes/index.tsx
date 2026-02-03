import { createFileRoute, redirect } from '@tanstack/react-router';
import { ThemeToggle } from '~/components/theme-toggle';
import HeroSection from '~/components/landing/HeroSection';
import FeaturesSection from '~/components/landing/FeaturesSection';
import MoodSection from '~/components/landing/MoodSection';
import IntegrationsSection from '~/components/landing/IntegrationsSection';
import TechStackSection from '~/components/landing/TechStackSection';
import CTASection from '~/components/landing/CTASection';

export const Route = createFileRoute('/')({
  component: Home,
  beforeLoad: async ({ context }) => {
    // If user is logged in, redirect to dashboard
    if (context.user) {
      throw redirect({ to: '/dashboard' });
    }
  },
});

function Home() {
  return (
    <div className="min-h-screen bg-background">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <HeroSection />
      <FeaturesSection />
      <MoodSection />
      <IntegrationsSection />
      <TechStackSection />
      <CTASection />
    </div>
  );
}
