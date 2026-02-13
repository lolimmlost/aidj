/**
 * VirtualizedSortableList - A virtualized list with drag-and-drop support
 *
 * Combines @tanstack/react-virtual with @dnd-kit for efficient
 * rendering of large sortable lists.
 */

import { useRef, useCallback, type ReactNode, type CSSProperties } from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';

export interface VirtualizedSortableListProps<T> {
  /** Array of items to render */
  items: T[];
  /** Function to get unique ID from item */
  getItemId: (item: T) => UniqueIdentifier;
  /** Height of each item in pixels (for fixed height lists) */
  itemHeight?: number;
  /** Function to estimate item height (for variable height lists) */
  estimateSize?: (index: number) => number;
  /** Render function for each item */
  renderItem: (
    item: T,
    index: number,
    virtualRow: VirtualItem,
    isDragging: boolean
  ) => ReactNode;
  /** Height of the scrollable container */
  containerHeight?: number;
  /** Additional class names for the scroll container */
  className?: string;
  /** Additional class names for the inner content container */
  innerClassName?: string;
  /** Number of items to render outside the visible area (overscan) */
  overscan?: number;
  /** Callback when drag ends */
  onDragEnd: (event: DragEndEvent) => void;
  /** Optional callback when drag starts */
  onDragStart?: (event: DragStartEvent) => void;
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
  /** Pointer sensor activation distance */
  activationDistance?: number;
  /** Whether drag and drop is disabled */
  disabled?: boolean;
}

export function VirtualizedSortableList<T>({
  items,
  getItemId,
  itemHeight = 64,
  estimateSize,
  renderItem,
  containerHeight = 400,
  className,
  innerClassName,
  overscan = 5,
  onDragEnd,
  onDragStart,
  emptyState,
  isLoading,
  loadingComponent,
  gap = 0,
  paddingX = 0,
  paddingY = 0,
  activationDistance = 8,
  disabled = false,
}: VirtualizedSortableListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<UniqueIdentifier | null>(null);

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
    getItemKey: (index) => getItemId(items[index]),
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Configure sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: activationDistance,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      activeIdRef.current = event.active.id;
      onDragStart?.(event);
    },
    [onDragStart]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      activeIdRef.current = null;
      onDragEnd(event);
    },
    [onDragEnd]
  );

  // Show loading state
  if (isLoading && loadingComponent) {
    return <>{loadingComponent}</>;
  }

  // Show empty state
  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const itemIds = items.map(getItemId);

  return (
    <DndContext
      sensors={disabled ? undefined : sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div
          ref={parentRef}
          className={cn('overflow-auto', className)}
          style={{ height: containerHeight }}
        >
          <div
            className={cn('relative w-full', innerClassName)}
            style={{
              height: totalSize + paddingY * 2,
              paddingLeft: paddingX,
              paddingRight: paddingX,
            }}
          >
            {/* eslint-disable react-hooks/refs */}
            {virtualItems.map((virtualRow) => {
              const item = items[virtualRow.index];
              const itemId = getItemId(item);
              const isDragging = activeIdRef.current === itemId;

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
                  {renderItem(item, virtualRow.index, virtualRow, isDragging)}
                </div>
              );
            })}
            {/* eslint-enable react-hooks/refs */}
          </div>
        </div>
      </SortableContext>
    </DndContext>
  );
}

/**
 * Hook for using virtualized sortable lists with custom implementations
 */
export function useVirtualizedSortableList<T>({
  items,
  getItemId,
  itemHeight = 64,
  estimateSize,
  overscan = 5,
  parentRef,
}: {
  items: T[];
  getItemId: (item: T) => UniqueIdentifier;
  itemHeight?: number;
  estimateSize?: (index: number) => number;
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
    getItemKey: (index) => getItemId(items[index]),
  });

  // Configure sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  return {
    virtualizer,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
    measureElement: virtualizer.measureElement,
    sensors,
    itemIds: items.map(getItemId),
  };
}

export type { VirtualItem, DragEndEvent, DragStartEvent, UniqueIdentifier };
