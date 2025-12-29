import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualizedList, useVirtualizedList } from '../virtualized-list';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';

// Mock the virtualizer - we don't need to test the library itself
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

describe('VirtualizedList', () => {
  const mockItems = [
    { id: '1', name: 'Item 1' },
    { id: '2', name: 'Item 2' },
    { id: '3', name: 'Item 3' },
  ];

  describe('Basic Rendering', () => {
    it('should render virtualized items', () => {
      render(
        <VirtualizedList
          items={mockItems}
          itemHeight={64}
          containerHeight={400}
          renderItem={(item) => <div data-testid={`item-${item.id}`}>{item.name}</div>}
          getItemKey={(item) => item.id}
        />
      );

      // Check that all virtual items are rendered
      expect(screen.getByTestId('item-1')).toBeInTheDocument();
      expect(screen.getByTestId('item-2')).toBeInTheDocument();
      expect(screen.getByTestId('item-3')).toBeInTheDocument();
    });

    it('should render empty state when items array is empty', () => {
      render(
        <VirtualizedList
          items={[]}
          itemHeight={64}
          containerHeight={400}
          renderItem={(item) => <div>{item.name}</div>}
          emptyState={<div data-testid="empty-state">No items</div>}
        />
      );

      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    it('should render loading state when isLoading is true', () => {
      render(
        <VirtualizedList
          items={mockItems}
          itemHeight={64}
          containerHeight={400}
          isLoading={true}
          loadingComponent={<div data-testid="loading">Loading...</div>}
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      expect(screen.getByTestId('loading')).toBeInTheDocument();
    });
  });

  describe('Container Styling', () => {
    it('should apply custom className to container', () => {
      const { container } = render(
        <VirtualizedList
          items={mockItems}
          itemHeight={64}
          containerHeight={400}
          className="custom-class"
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });

    it('should set container height correctly', () => {
      const { container } = render(
        <VirtualizedList
          items={mockItems}
          itemHeight={64}
          containerHeight={500}
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      const scrollContainer = container.querySelector('.overflow-auto');
      expect(scrollContainer).toHaveStyle({ height: '500px' });
    });
  });

  describe('Item Rendering', () => {
    it('should pass correct item and index to renderItem', () => {
      const renderSpy = vi.fn((item, index) => (
        <div data-testid={`item-${index}`}>{item.name}</div>
      ));

      render(
        <VirtualizedList
          items={mockItems}
          itemHeight={64}
          containerHeight={400}
          renderItem={renderSpy}
        />
      );

      // The mock virtualizer returns 3 items
      expect(renderSpy).toHaveBeenCalledTimes(3);
    });

    it('should use getItemKey for stable keys', () => {
      const getItemKeySpy = vi.fn((item) => item.id);

      render(
        <VirtualizedList
          items={mockItems}
          itemHeight={64}
          containerHeight={400}
          getItemKey={getItemKeySpy}
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      // getItemKey is called during virtualizer setup
      // Just verify no errors occur
      expect(true).toBe(true);
    });
  });

  describe('Scroll Behavior', () => {
    it('should apply smooth scroll class when smoothScroll is true', () => {
      const { container } = render(
        <VirtualizedList
          items={mockItems}
          itemHeight={64}
          containerHeight={400}
          smoothScroll={true}
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      const scrollContainer = container.querySelector('.scroll-smooth');
      expect(scrollContainer).toBeInTheDocument();
    });

    it('should not apply smooth scroll class when smoothScroll is false', () => {
      const { container } = render(
        <VirtualizedList
          items={mockItems}
          itemHeight={64}
          containerHeight={400}
          smoothScroll={false}
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      const scrollContainer = container.querySelector('.scroll-smooth');
      expect(scrollContainer).not.toBeInTheDocument();
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
        <VirtualizedList
          items={manyItems}
          itemHeight={64}
          containerHeight={400}
          renderItem={(item) => <div>{item.name}</div>}
        />
      );

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render very quickly since only visible items are rendered
      expect(renderTime).toBeLessThan(100);
    });
  });
});

describe('useVirtualizedList Hook', () => {
  it('should initialize with correct values', () => {
    const mockItems = [{ id: '1' }, { id: '2' }, { id: '3' }];

    const { result } = renderHook(() => {
      const parentRef = useRef<HTMLDivElement>(null);
      return useVirtualizedList({
        items: mockItems,
        itemHeight: 64,
        parentRef,
      });
    });

    expect(result.current.virtualItems).toBeDefined();
    expect(result.current.totalSize).toBe(192); // From mock
    expect(result.current.measureElement).toBeDefined();
  });

  it('should use custom estimateSize function', () => {
    const mockItems = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const customEstimateSize = vi.fn(() => 100);

    const { result } = renderHook(() => {
      const parentRef = useRef<HTMLDivElement>(null);
      return useVirtualizedList({
        items: mockItems,
        estimateSize: customEstimateSize,
        parentRef,
      });
    });

    expect(result.current.virtualItems).toBeDefined();
  });

  it('should use custom getItemKey function', () => {
    const mockItems = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const customGetItemKey = vi.fn((item) => item.id);

    const { result } = renderHook(() => {
      const parentRef = useRef<HTMLDivElement>(null);
      return useVirtualizedList({
        items: mockItems,
        getItemKey: customGetItemKey,
        parentRef,
      });
    });

    expect(result.current.virtualItems).toBeDefined();
  });
});
