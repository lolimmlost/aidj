import { Disc3, ArrowRight, ChevronDown } from 'lucide-react';
import { Link } from '@tanstack/react-router';

export default function HeroSection() {
  return (
    <section className="relative min-h-svh flex flex-col items-center justify-center overflow-hidden bg-background px-4">
      {/* Background effects */}
      <div className="dot-pattern" />

      {/* Glow orbs */}
      <div className="hero-glow -top-40 -left-40 sm:-top-60 sm:-left-60" />
      <div className="hero-glow-secondary top-1/4 -right-40 sm:-right-60" />
      <div className="hero-glow-tertiary bottom-20 left-1/4" />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto">
        {/* Animated disc logo */}
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-primary/30 rounded-full blur-2xl scale-150 animate-pulse-glow" />
          <Disc3
            className="relative w-20 h-20 sm:w-28 sm:h-28 text-primary animate-spin-slow"
            strokeWidth={1.5}
          />
        </div>

        {/* Brand name */}
        <h1 className="text-6xl sm:text-7xl lg:text-8xl font-bold tracking-tight mb-4 animate-fade-up">
          <span className="text-gradient-brand">AIDJ</span>
        </h1>

        {/* Tagline */}
        <p
          className="text-lg sm:text-xl lg:text-2xl text-muted-foreground mb-8 animate-fade-up"
          style={{ animationDelay: '100ms' }}
        >
          Your AI-powered music command center
        </p>

        {/* CTA Button */}
        <div className="animate-fade-up" style={{ animationDelay: '200ms' }}>
          <Link to="/login" className="action-button text-base sm:text-lg">
            Get Started
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

        {/* Subtext */}
        <p
          className="mt-6 text-sm text-muted-foreground animate-fade-up"
          style={{ animationDelay: '300ms' }}
        >
          Self-hosted. Private. Your music, your rules.
        </p>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce-subtle">
        <ChevronDown className="w-6 h-6 text-muted-foreground" />
      </div>
    </section>
  );
}
