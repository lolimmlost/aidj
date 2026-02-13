/**
 * Lazy Loading Utilities for Code Splitting
 *
 * This module provides utilities for lazy loading components with:
 * - Suspense boundaries with fallback loading states
 * - Deferred loading for non-critical content
 * - Preloading capabilities for improved UX
 */

import React, { Suspense, lazy, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Type for lazy component factories
 */
type LazyFactory<T extends ComponentType<Record<string, unknown>>> = () => Promise<{ default: T }>;

/**
 * Options for lazy loading components
 */
interface _LazyLoadOptions {
  /** Custom fallback component while loading */
  fallback?: ReactNode;
  /** Minimum delay before showing content (prevents flash) */
  minDelay?: number;
  /** Whether to preload on mount */
  preloadOnMount?: boolean;
}

/**
 * Creates a lazy-loaded component with Suspense wrapper
 *
 * @example
 * const LazyDJFeatures = createLazyComponent(() => import('@/components/dashboard/DJFeatures'));
 *
 * // In JSX:
 * <LazyDJFeatures fallback={<Skeleton className="h-64" />} />
 */
export function createLazyComponent<P extends object>(
  importFn: LazyFactory<ComponentType<P>>,
  defaultFallback?: ReactNode
) {
  const LazyComponent = lazy(importFn);

  // Store the import function for preloading
  const preload = () => importFn();

  const WrappedComponent = (props: P & { fallback?: ReactNode }) => {
    const { fallback = defaultFallback, ...rest } = props as P & { fallback?: ReactNode };

    return (
      <Suspense fallback={fallback || <DefaultLoadingFallback />}>
        <LazyComponent {...(rest as P)} />
      </Suspense>
    );
  };

  // Attach preload function to the component
  (WrappedComponent as unknown as { preload: typeof preload }).preload = preload;

  return WrappedComponent as typeof WrappedComponent & { preload: typeof preload };
}

/**
 * Hook for deferring component rendering until after initial paint
 * Useful for non-critical UI elements that shouldn't block initial render
 *
 * @param delay - Delay in milliseconds before rendering (default: 0, uses requestIdleCallback)
 * @returns boolean indicating if the deferred content should render
 *
 * @example
 * const shouldShowFeatures = useDeferredRender(2000);
 *
 * return (
 *   <>
 *     <CriticalContent />
 *     {shouldShowFeatures && <NonCriticalFeatures />}
 *   </>
 * );
 */
export function useDeferredRender(delay: number = 0): boolean {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    // If delay is 0, use requestIdleCallback for optimal scheduling
    if (delay === 0) {
      if ('requestIdleCallback' in window) {
        const id = requestIdleCallback(() => setShouldRender(true), { timeout: 2000 });
        return () => cancelIdleCallback(id);
      } else {
        // Fallback for browsers without requestIdleCallback
        const id = setTimeout(() => setShouldRender(true), 50);
        return () => clearTimeout(id);
      }
    }

    // Otherwise use the specified delay
    const id = setTimeout(() => setShouldRender(true), delay);
    return () => clearTimeout(id);
  }, [delay]);

  return shouldRender;
}

/**
 * Component wrapper for deferred rendering
 * Renders children only after the specified delay
 */
interface DeferredProps {
  children: ReactNode;
  /** Delay in ms before rendering (default: 0, uses requestIdleCallback) */
  delay?: number;
  /** Fallback to show while waiting (optional) */
  fallback?: ReactNode;
}

export function Deferred({ children, delay = 0, fallback = null }: DeferredProps) {
  const shouldRender = useDeferredRender(delay);

  if (!shouldRender) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Default loading fallback component
 */
function DefaultLoadingFallback() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-48" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

/**
 * Loading fallback for feature cards
 */
export function FeatureCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  );
}

/**
 * Loading fallback for section content
 */
export function SectionSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" style={{ width: `${100 - (i * 10)}%` }} />
        ))}
      </div>
    </div>
  );
}

/**
 * Loading fallback for sidebar items
 */
export function SidebarItemSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
          <Skeleton className="h-10 w-10 rounded-md" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Preloads a lazy component
 * Can be used for anticipatory loading (e.g., on hover)
 *
 * @example
 * <button
 *   onMouseEnter={() => LazyDJFeatures.preload()}
 *   onClick={() => setShowDJ(true)}
 * >
 *   Show DJ Features
 * </button>
 */
export function preloadComponent<T extends { preload: () => Promise<unknown> }>(component: T) {
  return component.preload();
}
