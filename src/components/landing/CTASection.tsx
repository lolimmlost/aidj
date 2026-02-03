import { ArrowRight, ExternalLink } from 'lucide-react';
import { Link } from '@tanstack/react-router';

export default function CTASection() {
  return (
    <section className="relative py-24 sm:py-32 px-4 overflow-hidden bg-background">
      {/* Background effects */}
      <div className="hero-glow top-0 left-1/4 opacity-60" />
      <div className="hero-glow-secondary -bottom-40 right-1/4 opacity-50" />

      <div className="relative z-10 max-w-3xl mx-auto">
        {/* Hero container */}
        <div className="hero-section p-8 sm:p-12 lg:p-16 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6">
            Ready to take control of your{' '}
            <span className="text-gradient-brand">music</span>?
          </h2>

          <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
            Open source. Self-hosted. Zero tracking. Join the growing community
            of music lovers who own their listening experience.
          </p>

          {/* CTA Button */}
          <Link to="/login" className="action-button text-base sm:text-lg">
            Get Started
            <ArrowRight className="w-5 h-5" />
          </Link>

          {/* Trust badges */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
            <span>✓ Open source</span>
            <span className="hidden sm:inline">•</span>
            <span>✓ Self-hosted</span>
            <span className="hidden sm:inline">•</span>
            <span>✓ Zero tracking</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 mt-16 text-center">
        <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
          <a
            href="https://unlicense.org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            Unlicense (public domain)
            <ExternalLink className="w-3 h-3" />
          </a>
          <span>•</span>
          <span>Built with ♫ for music lovers</span>
        </div>
      </footer>
    </section>
  );
}
