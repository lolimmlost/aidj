import React from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  backLink?: string;
  backLabel?: string;
  className?: string;
  /** Full-width mode without container constraints */
  fullWidth?: boolean;
  /** Compact header for secondary pages */
  compact?: boolean;
}

/**
 * Unified page layout component for consistent styling across all pages
 * Provides: consistent spacing, header formatting, responsive design
 */
export function PageLayout({
  children,
  title,
  description,
  icon,
  actions,
  backLink = '/dashboard',
  backLabel = 'Dashboard',
  className,
  fullWidth = false,
  compact = false,
}: PageLayoutProps) {
  return (
    <div className={cn(
      'min-h-screen bg-background',
      !fullWidth && 'pb-24 md:pb-20', // Space for audio player
      className
    )}>
      <div className={cn(
        'mx-auto',
        !fullWidth && 'container px-4 sm:px-6 lg:px-8 py-6 sm:py-8'
      )}>
        {/* Page Header */}
        <header className={cn(
          'mb-6 sm:mb-8',
          compact && 'mb-4 sm:mb-6'
        )}>
          {/* Back Navigation */}
          {backLink && (
            <Link
              to={backLink}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 group"
            >
              <ChevronLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
              <span>{backLabel}</span>
            </Link>
          )}

          {/* Title Row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              {icon ? (
                <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 text-primary">
                  {icon}
                </div>
              ) : null}
              <div>
                <h1 className={cn(
                  'font-bold tracking-tight text-foreground',
                  compact ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'
                )}>
                  {title}
                </h1>
                {description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {description}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            {actions ? (
              <div className="flex items-center gap-3 flex-wrap">
                {actions}
              </div>
            ) : null}
          </div>
        </header>

        {/* Page Content */}
        <main className="space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}

interface PageSectionProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Section wrapper for consistent spacing within pages
 */
export function PageSection({
  children,
  title,
  description,
  actions,
  className
}: PageSectionProps) {
  const showHeader = Boolean(title) || Boolean(actions);

  return (
    <section className={cn('space-y-4', className)}>
      {showHeader ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {title ? (
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                {title}
              </h2>
              {description ? (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {description}
                </p>
              ) : null}
            </div>
          ) : null}
          {actions ? (
            <div className="flex items-center gap-2 flex-wrap">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

interface FeatureCardProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  href?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'purple' | 'blue';
  badge?: string;
  className?: string;
}

/**
 * Feature card component for consistent card styling
 */
export function FeatureCard({
  children,
  title,
  description,
  icon,
  href,
  variant = 'default',
  badge,
  className,
}: FeatureCardProps) {
  const variantStyles = {
    default: 'bg-card border-border hover:border-border/80',
    primary: 'bg-primary/5 border-primary/20 hover:border-primary/40',
    success: 'bg-green-500/5 border-green-500/20 hover:border-green-500/40',
    warning: 'bg-orange-500/5 border-orange-500/20 hover:border-orange-500/40',
    purple: 'bg-purple-500/5 border-purple-500/20 hover:border-purple-500/40',
    blue: 'bg-blue-500/5 border-blue-500/20 hover:border-blue-500/40',
  };

  const iconVariantStyles = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-green-500/10 text-green-600 dark:text-green-400',
    warning: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  };

  const content = (
    <div className={cn(
      'relative p-5 sm:p-6 rounded-xl border transition-all duration-200',
      'hover:shadow-md hover:-translate-y-0.5',
      variantStyles[variant],
      className
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        {icon ? (
          <div className={cn(
            'flex items-center justify-center w-10 h-10 rounded-lg',
            iconVariantStyles[variant]
          )}>
            {icon}
          </div>
        ) : null}
        {badge ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
            {badge}
          </span>
        ) : null}
      </div>

      {/* Content */}
      <h3 className="font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
      )}
      {children}
    </div>
  );

  if (href) {
    return (
      <Link to={href} className="block group">
        {content}
      </Link>
    );
  }

  return content;
}

interface StatsCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
}

/**
 * Stats card for displaying metrics
 */
export function StatsCard({
  label,
  value,
  icon,
  trend,
  trendValue,
  className,
}: StatsCardProps) {
  return (
    <div className={cn(
      'p-4 sm:p-5 rounded-xl bg-card border border-border',
      className
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon ? (
          <div className="text-muted-foreground">
            {icon}
          </div>
        ) : null}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl sm:text-3xl font-bold text-foreground">{value}</span>
        {trendValue && trend && (
          <span className={cn(
            'text-sm font-medium mb-1',
            trend === 'up' && 'text-green-600',
            trend === 'down' && 'text-red-600',
            trend === 'neutral' && 'text-muted-foreground'
          )}>
            {trend === 'up' && '↑'}
            {trend === 'down' && '↓'}
            {trendValue}
          </span>
        )}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Empty state component for when there's no data
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center py-12 px-6',
      'rounded-xl border border-dashed border-border bg-muted/30',
      className
    )}>
      {icon ? (
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-4">
          {icon}
        </div>
      ) : null}
      <h3 className="text-lg font-medium text-foreground mb-1">{title}</h3>
      {description ? (
        <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

interface LoadingGridProps {
  count?: number;
  className?: string;
}

/**
 * Loading grid skeleton for consistent loading states
 */
export function LoadingGrid({ count = 6, className }: LoadingGridProps) {
  return (
    <div className={cn(
      'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4',
      className
    )}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={`loading-skeleton-${i}`}
          className="p-5 rounded-xl border border-border bg-card animate-pulse"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-muted" />
            <div className="h-4 w-20 rounded bg-muted" />
          </div>
          <div className="h-5 w-3/4 rounded bg-muted mb-2" />
          <div className="h-4 w-full rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
