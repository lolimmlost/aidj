/**
 * VirtualizedList - A reusable virtualized list component using @tanstack/react-virtual
 *
 * Efficiently renders large lists by only rendering visible items.
 * Supports both fixed and variable item heights.
 */

import { useRef, useCallback, type ReactNode, type CSSProperties } from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';

export interface VirtualizedListProps<T> {
  /** Array of items to render */
  items: T[];
  /** Height of each item in pixels (for fixed height lists) */
  itemHeight?: number;
  /** Function to estimate item height (for variable height lists) */
  estimateSize?: (index: number) => number;
  /** Render function for each item */
  renderItem: (item: T, index: number, virtualRow: VirtualItem) => ReactNode;
  /** Optional key extractor (defaults to index) */
  getItemKey?: (item: T, index: number) => string | number;
  /** Height of the scrollable container */
  containerHeight?: number;
  /** Additional class names for the scroll container */
  className?: string;
  /** Additional class names for the inner content container */
  innerClassName?: string;
  /** Number of items to render outside the visible area (overscan) */
  overscan?: number;
  /** Whether to use smooth scrolling */
  smoothScroll?: boolean;
  /** Callback when the list is scrolled */
  onScroll?: (scrollTop: number) => void;
  /** Optional empty state to render when items array is empty */
  emptyState?: ReactNode;
  /** Optional loading state */
  isLoading?: boolean;
  /** Optional loading component */
  loadingComponent?: ReactNode;
  /** Gap between items in pixels */
  gap?: number;
  /** Horizontal padding in pixels */
  paddingX?: number;
  /** Vertical padding in pixels */
  paddingY?: number;
}

export function VirtualizedList<T>({
  items,
  itemHeight = 64,
  estimateSize,
  renderItem,
  getItemKey,
  containerHeight = 400,
  className,
  innerClassName,
  overscan = 5,
  smoothScroll = true,
  onScroll,
  emptyState,
  isLoading,
  loadingComponent,
  gap = 0,
  paddingX = 0,
  paddingY = 0,
}: VirtualizedListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const getEstimatedSize = useCallback(
    (index: number) => {
      if (estimateSize) {
        return estimateSize(index) + gap;
      }
      return itemHeight + gap;
    },
    [estimateSize, itemHeight, gap]
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: getEstimatedSize,
    overscan,
    getItemKey: getItemKey
      ? (index) => getItemKey(items[index], index)
      : undefined,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Handle scroll events
  const handleScroll = useCallback(() => {
    if (onScroll && parentRef.current) {
      onScroll(parentRef.current.scrollTop);
    }
  }, [onScroll]);

  // Show loading state
  if (isLoading && loadingComponent) {
    return <>{loadingComponent}</>;
  }

  // Show empty state
  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div
      ref={parentRef}
      className={cn(
        'overflow-auto',
        smoothScroll && 'scroll-smooth',
        className
      )}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div
        className={cn('relative w-full', innerClassName)}
        style={{
          height: totalSize + paddingY * 2,
          paddingLeft: paddingX,
          paddingRight: paddingX,
        }}
      >
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index];
          const style: CSSProperties = {
            position: 'absolute',
            top: 0,
            left: paddingX,
            right: paddingX,
            width: `calc(100% - ${paddingX * 2}px)`,
            transform: `translateY(${virtualRow.start + paddingY}px)`,
          };

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={style}
            >
              {renderItem(item, virtualRow.index, virtualRow)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Hook for using virtualization with custom implementations
 */
export function useVirtualizedList<T>({
  items,
  itemHeight = 64,
  estimateSize,
  getItemKey,
  overscan = 5,
  parentRef,
}: {
  items: T[];
  itemHeight?: number;
  estimateSize?: (index: number) => number;
  getItemKey?: (item: T, index: number) => string | number;
  overscan?: number;
  parentRef: React.RefObject<HTMLDivElement | null>;
}) {
  const getEstimatedSize = useCallback(
    (index: number) => {
      if (estimateSize) {
        return estimateSize(index);
      }
      return itemHeight;
    },
    [estimateSize, itemHeight]
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: getEstimatedSize,
    overscan,
    getItemKey: getItemKey
      ? (index) => getItemKey(items[index], index)
      : undefined,
  });

  return {
    virtualizer,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
    measureElement: virtualizer.measureElement,
  };
}

export type { VirtualItem };
