import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualizedSortableList } from '../virtualized-sortable-list';

// Mock the virtualizer
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(() => ({
    getVirtualItems: () => [
      { key: 'item-0', index: 0, start: 0, size: 64 },
      { key: 'item-1', index: 1, start: 64, size: 64 },
      { key: 'item-2', index: 2, start: 128, size: 64 },
    ],
    getTotalSize: () => 192,
    measureElement: vi.fn(),
  })),
}));

// Mock dnd-kit
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div data-testid="dnd-context">{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  TouchSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div data-testid="sortable-context">{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: {},
}));

describe('VirtualizedSortableList', () => {
  const mockItems = [
    { id: '1', name: 'Item 1' },
    { id: '2', name: 'Item 2' },
    { id: '3', name: 'Item 3' },
  ];

  const mockOnDragEnd = vi.fn();
  const mockGetItemId = (item: typeof mockItems[0]) => item.id;

  describe('Basic Rendering', () => {
    it('should render virtualized sortable items', () => {
      render(
        <VirtualizedSortableList
          items={mockItems}
          getItemId={mockGetItemId}
          itemHeight={64}
          containerHeight={400}
          onDragEnd={mockOnDragEnd}
          renderItem={(item, index, virtualRow, isDragging) => (
            <div data-testid={`item-${item.id}`} data-dragging={isDragging}>
              {item.name}
            </div>
          )}
        />
      );

      // Check that all virtual items are rendered
      expect(screen.getByTestId('item-1')).toBeInTheDocument();
      expect(screen.getByTestId('item-2')).toBeInTheDocument();
      expect(screen.getByTestId('item-3')).toBeInTheDocument();
    });

    it('should wrap content in DndContext and SortableContext', () => {
      render(
        <VirtualizedSortableList
          items={mockItems}
          getItemId={mockGetItemId}
          itemHeight={64}
          containerHeight={400}
          onDragEnd={mockOnDragEnd}
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
      expect(screen.getByTestId('sortable-context')).toBeInTheDocument();
    });

    it('should render empty state when items array is empty', () => {
      render(
        <VirtualizedSortableList
          items={[]}
          getItemId={mockGetItemId}
          itemHeight={64}
          containerHeight={400}
          onDragEnd={mockOnDragEnd}
          emptyState={<div data-testid="empty-state">No items</div>}
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    it('should render loading state when isLoading is true', () => {
      render(
        <VirtualizedSortableList
          items={mockItems}
          getItemId={mockGetItemId}
          itemHeight={64}
          containerHeight={400}
          isLoading={true}
          loadingComponent={<div data-testid="loading">Loading...</div>}
          onDragEnd={mockOnDragEnd}
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      expect(screen.getByTestId('loading')).toBeInTheDocument();
    });
  });

  describe('Drag and Drop', () => {
    it('should pass isDragging=false to renderItem by default', () => {
      const renderSpy = vi.fn((item, index, virtualRow, isDragging) => (
        <div data-testid={`item-${item.id}`} data-dragging={String(isDragging)}>
          {item.name}
        </div>
      ));

      render(
        <VirtualizedSortableList
          items={mockItems}
          getItemId={mockGetItemId}
          itemHeight={64}
          containerHeight={400}
          onDragEnd={mockOnDragEnd}
          renderItem={renderSpy}
        />
      );

      // Verify items are rendered with isDragging=false
      const item1 = screen.getByTestId('item-1');
      expect(item1).toHaveAttribute('data-dragging', 'false');
    });

    it('should accept onDragStart callback', () => {
      const onDragStart = vi.fn();

      render(
        <VirtualizedSortableList
          items={mockItems}
          getItemId={mockGetItemId}
          itemHeight={64}
          containerHeight={400}
          onDragEnd={mockOnDragEnd}
          onDragStart={onDragStart}
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      // Just verify it renders without error
      expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
    });

    it('should respect disabled prop', () => {
      render(
        <VirtualizedSortableList
          items={mockItems}
          getItemId={mockGetItemId}
          itemHeight={64}
          containerHeight={400}
          onDragEnd={mockOnDragEnd}
          disabled={true}
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      // Component should still render
      expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
    });
  });

  describe('Container Styling', () => {
    it('should apply custom className to container', () => {
      const { container } = render(
        <VirtualizedSortableList
          items={mockItems}
          getItemId={mockGetItemId}
          itemHeight={64}
          containerHeight={400}
          className="custom-class"
          onDragEnd={mockOnDragEnd}
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });

    it('should set container height correctly', () => {
      const { container } = render(
        <VirtualizedSortableList
          items={mockItems}
          getItemId={mockGetItemId}
          itemHeight={64}
          containerHeight={500}
          onDragEnd={mockOnDragEnd}
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      const scrollContainer = container.querySelector('.overflow-auto');
      expect(scrollContainer).toHaveStyle({ height: '500px' });
    });
  });

  describe('Performance', () => {
    it('should render quickly with many items', () => {
      const manyItems = Array.from({ length: 1000 }, (_, i) => ({
        id: `${i}`,
        name: `Item ${i}`,
      }));

      const startTime = performance.now();

      render(
        <VirtualizedSortableList
          items={manyItems}
          getItemId={(item) => item.id}
          itemHeight={64}
          containerHeight={400}
          onDragEnd={mockOnDragEnd}
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render very quickly since only visible items are rendered
      expect(renderTime).toBeLessThan(200);
    });
  });

  describe('Configuration Options', () => {
    it('should accept custom activationDistance', () => {
      render(
        <VirtualizedSortableList
          items={mockItems}
          getItemId={mockGetItemId}
          itemHeight={64}
          containerHeight={400}
          onDragEnd={mockOnDragEnd}
          activationDistance={16}
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
    });

    it('should accept custom overscan value', () => {
      render(
        <VirtualizedSortableList
          items={mockItems}
          getItemId={mockGetItemId}
          itemHeight={64}
          containerHeight={400}
          onDragEnd={mockOnDragEnd}
          overscan={10}
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
    });

    it('should accept gap and padding options', () => {
      render(
        <VirtualizedSortableList
          items={mockItems}
          getItemId={mockGetItemId}
          itemHeight={64}
          containerHeight={400}
          onDragEnd={mockOnDragEnd}
          gap={12}
          paddingX={16}
          paddingY={8}
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
    });
  });
});
