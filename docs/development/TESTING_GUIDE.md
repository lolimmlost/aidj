# Testing Guide for Download Request Interface

## Overview
This guide provides instructions for testing the Download Request Interface implementation in Story 4.2. The project uses Vitest for unit/integration tests and Playwright for E2E tests.

## Testing Setup

### Prerequisites
1. Install dependencies: `npm install`
2. Start the development server: `npm run dev`
3. Ensure the database is set up: `npm run db:studio` (for setup)

### Available Test Commands
```bash
# Unit/Integration Tests
npm test                    # Run all tests
npm run test:ui            # Run tests with UI
npm run test:coverage      # Run tests with coverage report
npm run test:watch         # Run tests in watch mode

# E2E Tests
npm run test:e2e           # Run E2E tests
npm run test:e2e:headed    # Run E2E tests with visible browser
npm run test:e2e:debug     # Run E2E tests in debug mode
npm run test:e2e:ui        # Run E2E tests with UI
```

## Testing the Download Request Interface

### 1. Unit Testing Components

#### Search Interface Tests
The search interface components are located in `src/components/__tests__/search-interface.test.tsx`:

```bash
# Run specific test file
npm test src/components/__tests__/search-interface.test.tsx

# Run with coverage
npm run test:coverage -- src/components/__tests__/search-interface.test.tsx
```

**Test Coverage:**
- ✅ Search input rendering and functionality
- ✅ Form submission handling
- ✅ Loading states
- ✅ Clear button functionality
- ✅ Search results display
- ✅ Result selection handling
- ✅ Image fallback handling

#### Download Request Component Tests
Create tests for the download request component:

```typescript
// src/components/__tests__/download-request.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DownloadRequest } from '../ui/download-request';

describe('DownloadRequest', () => {
  it('renders download request form', () => {
    render(<DownloadRequest userId="test-user" />);
    expect(screen.getByText('Request Download')).toBeInTheDocument();
  });

  it('handles search submission', async () => {
    const mockOnSearch = vi.fn();
    render(<DownloadRequest userId="test-user" />);
    
    // Test search functionality
    // ...
  });

  it('shows loading state during request', async () => {
    render(<DownloadRequest userId="test-user" />);
    
    // Test loading state
    // ...
  });
});
```

### 2. Service Layer Testing

#### Download Request Service Tests
The download request service is located in `src/lib/services/download-request.ts`:

```bash
# Run service tests
npm test src/lib/services/download-request.test.ts
```

**Test Coverage:**
- ✅ Database connection and schema
- ✅ Download request creation
- ✅ Duplicate detection logic
- ✅ Request status management
- ✅ Error handling
- ✅ User request retrieval

#### Mock Database for Testing
Create a test database configuration:

```typescript
// src/lib/db/test-config.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../schema';

const connectionString = 'postgresql://test:test@localhost:5432/test_db';

export const testDb = drizzle(postgres(connectionString), { schema });
```

### 3. API Route Testing

#### Lidarr API Tests
Test the enhanced `/api/lidarr/add` endpoint:

```typescript
// src/routes/__tests__/lidarr-add.test.ts
import { createServer } from 'http';
import { request } from 'http';
import { ServerRoute } from '../api/lidarr/add';

describe('Lidarr API Routes', () => {
  it('handles download request submission', async () => {
    // Test API endpoint
    // ...
  });

  it('detects duplicate requests', async () => {
    // Test duplicate detection
    // ...
  });

  it('returns error for invalid requests', async () => {
    // Test error handling
    // ...
  });
});
```

### 4. E2E Testing

#### Complete User Workflow
Create E2E tests for the complete download request workflow:

```typescript
// tests/e2e/download-request.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Download Request Interface', () => {
  test('user can search and request download', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Navigate to download request page
    // Search for artist
    // Select result
    // Submit request
    // Verify success message
  });

  test('duplicate detection prevents duplicate requests', async ({ page }) => {
    // Test duplicate prevention
  });

  test('error handling shows appropriate messages', async ({ page }) => {
    // Test error scenarios
  });
});
```

### 5. Running Tests

#### Development Testing
```bash
# Start development server
npm run dev

# In another terminal, run tests
npm test

# Run specific test file
npm test -- src/components/__tests__/search-interface.test.tsx

# Run with watch mode
npm run test:watch
```

#### CI/CD Testing
```bash
# Run all tests with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run all tests
npm test && npm run test:e2e
```

### 6. Test Data Setup

#### Mock Data for Testing
Create mock data files:

```typescript
// src/__tests__/mock-data.ts
export const mockSearchResults = [
  {
    id: '1',
    name: 'Test Artist',
    type: 'artist' as const,
    images: [{ coverType: 'cover', url: 'test.jpg' }],
    year: '2023',
  }
];

export const mockDownloadRequest = {
  id: 'req-1',
  userId: 'user-1',
  requestType: 'artist' as const,
  artistName: 'Test Artist',
  status: 'pending' as const,
  createdAt: new Date(),
};
```

### 7. Testing Environment Variables

Create test environment file:
```bash
# .env.test
LIDARR_API_KEY=test_key
LIDARR_URL=http://localhost:8686
DATABASE_URL=postgresql://test:test@localhost:5432/test_db
```

### 8. Coverage Reports

Generate coverage reports:
```bash
# Generate coverage report
npm run test:coverage

# Open coverage report
npm run test:coverage && open coverage/index.html
```

### 9. Debugging Tests

#### Debug Unit Tests
```bash
# Run tests with debug flag
npm test -- --run

# Run specific test with debug
npm test -- --run src/components/__tests__/search-interface.test.tsx
```

#### Debug E2E Tests
```bash
# Run E2E tests in headed mode
npm run test:e2e:headed

# Run in debug mode
npm run test:e2e:debug
```

### 10. Common Testing Scenarios

#### Positive Test Cases
- ✅ User searches for valid artist
- ✅ User selects search result
- ✅ User submits download request
- ✅ System shows success message
- ✅ Request is stored in database

#### Negative Test Cases
- ❌ User searches with empty query
- ❌ User searches for non-existent artist
- ❌ User submits duplicate request
- ❌ Network error during API call
- ❌ Invalid request format

#### Edge Cases
- 🔍 Long search queries
- 🔍 Special characters in search
- 🔍 Slow network conditions
- 🔌 Database connection failures
- 🔒 Authentication errors

### 11. Performance Testing

#### Component Performance
```typescript
// Test component rendering performance
import { performance } from 'perf_hooks';

test('search interface renders within acceptable time', () => {
  const start = performance.now();
  render(<SearchInterface onSearch={vi.fn()} />);
  const end = performance.now();
  
  expect(end - start).toBeLessThan(100); // Should render in < 100ms
});
```

### 12. Accessibility Testing

#### Component Accessibility
```typescript
// Test accessibility attributes
test('search interface has proper ARIA labels', () => {
  render(<SearchInterface onSearch={vi.fn()} />);
  
  const searchInput = screen.getByLabelText('Search for artists, albums, or songs...');
  expect(searchInput).toBeInTheDocument();
  expect(searchInput).toHaveAttribute('aria-label');
});
```

## Next Steps

1. **Run the existing tests**: `npm test`
2. **Check coverage**: `npm run test:coverage`
3. **Run E2E tests**: `npm run test:e2e:headed`
4. **Create additional test files** for missing coverage
5. **Add integration tests** for API endpoints
6. **Write E2E tests** for complete user workflows

This comprehensive testing approach ensures the Download Request Interface is thoroughly tested and ready for production use.