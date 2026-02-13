# Developer Instructions: Testing Issues Fix

## Overview
This document provides detailed, actionable instructions for developers to fix the testing issues identified in the project. Follow these steps sequentially to resolve all testing problems.

## Prerequisites
1. Ensure you have Node.js 18+ installed
2. Run `npm install` to install dependencies
3. Start development server: `npm run dev`

## Step 1: Fix Testing Library Issues

### File: `src/components/__tests__/search-interface.test.tsx`

#### Issue 1: Ambiguous button selection (Line 62)
**Current Code:**
```typescript
const clearButton = screen.getByRole('button');
```

**Fix:**
```typescript
const clearButton = screen.getByRole('button', { name: /clear/i });
```

#### Issue 2: Unclear button selection (Line 72)
**Current Code:**
```typescript
const clearButton = screen.getAllByRole('button')[0]; // First button is clear button
```

**Fix:**
```typescript
const clearButton = screen.getByRole('button', { name: /clear/i });
const searchButton = screen.getByRole('button', { name: /search/i });
```

#### Issue 3: Missing accessibility attributes
Add these tests to verify accessibility:
```typescript
it('has proper accessibility attributes', () => {
  render(<SearchInterface onSearch={mockOnSearch} />);
  
  // Search input should have proper label
  const searchInput = screen.getByPlaceholderText('Search for artists, albums, or songs...');
  expect(searchInput).toBeInTheDocument();
  expect(searchInput).toHaveAttribute('aria-label');
  
  // Clear button should have accessible name
  const clearButton = screen.getByRole('button', { name: /clear/i });
  expect(clearButton).toBeInTheDocument();
  
  // Search button should have accessible name
  const searchButton = screen.getByRole('button', { name: /search/i });
  expect(searchButton).toBeInTheDocument();
});
```

### File: `src/components/ui/search-interface.tsx`

#### Add accessibility attributes:
```typescript
// Update the clear button (around line 102-115)
<Button
  type="button"
  variant="ghost"
  size="icon"
  onClick={handleClear}
  aria-label="Clear search"
  className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2"
>
  <X className="h-4 w-4" />
</Button>

// Update the search button (around line 117-132)
<Button
  type="submit"
  disabled={loading || !query.trim()}
  aria-label="Search"
  className="ml-2 h-12 px-6"
>
  {loading ? (
    <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
  ) : (
    <Search className="h-4 w-4" />
  )}
</Button>
```

## Step 2: Fix Vitest Mock Issues

### File: `src/lib/services/__tests__/lidarr.test.ts`

#### Issue 1: Proper mock typing (Line 34)
**Current Code:**
```typescript
vi.mocked(fetch).mockResolvedValueOnce({
  ok: true,
  json: () => Promise.resolve(mockResponse),
} as Response);
```

**Fix:**
```typescript
vi.mocked(fetch).mockResolvedValueOnce({
  ok: true,
  json: vi.fn().mockResolvedValue(mockResponse),
} satisfies Response);
```

#### Issue 2: Mock setup improvement
Add proper mock setup at the top of the file:
```typescript
// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock config
vi.mock('../../config/config', () => ({
  getConfig: vi.fn().mockReturnValue({
    lidarrUrl: 'http://localhost:8686',
    lidarrApiKey: 'test-api-key',
  }),
}));
```

#### Update all mock calls:
```typescript
// Replace all vi.mocked(fetch) calls with:
mockFetch.mockResolvedValueOnce({
  ok: true,
  json: vi.fn().mockResolvedValue(mockResponse),
} satisfies Response);
```

## Step 3: Fix TypeScript Issues

### File: `src/lib/services/__tests__/lidarr.test.ts`

#### Add proper type definitions:
```typescript
// Add at the top of the file
interface MockResponse {
  ok: boolean;
  json: () => Promise<any>;
}

interface LidarrArtist {
  id: number;
  artistName: string;
  genres: string[];
  status: string;
  foreignArtistId?: string;
}

interface LidarrAlbum {
  id: number;
  title: string;
  artistId: number;
  releaseDate: string;
  images?: Array<{ coverType: string; url: string }>;
  foreignAlbumId?: string;
}
```

#### Fix import statements:
```typescript
// Use explicit imports
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchArtists, searchAlbums, getArtist, getAlbum, search } from '../lidarr';
import { getConfig } from '../../config/config';
```

#### Replace `any()` types:
```typescript
// Instead of:
const result: any = await response.json();

// Use:
interface SearchResult {
  id: string;
  name: string;
  type: 'artist' | 'album';
  genres?: string[];
  status?: string;
}

const result: SearchResult[] = await response.json();
```

## Step 4: Fix Component Issues

### File: `src/components/ui/search-interface.tsx`

#### Add proper prop types:
```typescript
// Update interface definitions
interface SearchInterfaceProps {
  onSearch: (query: string) => void;
  loading?: boolean;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

interface SearchResultsProps {
  results: Array<{
    id: string;
    name: string;
    type: 'artist' | 'album';
    images?: Array<{ coverType: string; url: string }>;
    year?: string;
    artist?: string;
  }>;
  onSelect: (result: {
    id: string;
    name: string;
    type: 'artist' | 'album';
    images?: Array<{ coverType: string; url: string }>;
    year?: string;
    artist?: string;
  }) => void;
  loading?: boolean;
  className?: string;
  'aria-label'?: string;
}
```

#### Add React.FC type:
```typescript
export const SearchInterface: React.FC<SearchInterfaceProps> = ({
  onSearch,
  loading = false,
  placeholder = "Search for artists, albums, or songs...",
  className,
  'aria-label': ariaLabel,
  ...props
}) => {
  // ... component logic
};
```

### File: `src/components/ui/download-request.tsx`

#### Fix undefined function references:
```typescript
// Add proper imports
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { SearchInterface, SearchResults } from "./search-interface";
import { Download, CheckCircle, XCircle, Loader2 } from "lucide-react";
```

## Step 5: Verification

### Run Tests After Each Fix

```bash
# Run specific test file
npm test src/components/__tests__/search-interface.test.tsx

# Run service tests
npm test src/lib/services/__tests__/lidarr.test.ts

# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

### Expected Test Output
All tests should pass without errors:
```
✓ src/components/__tests__/search-interface.test.tsx (171 tests)
✓ src/lib/services/__tests__/lidarr.test.ts (175 tests)
✓ Test coverage: 85%+
```

## Troubleshooting

### Common Issues and Solutions

1. **TypeScript compilation errors**:
   ```bash
   npx tsc --noEmit
   npm run type-check
   ```

2. **Test failures**:
   ```bash
   npm test -- --run
   npm test -- --verbose
   ```

3. **Mock issues**:
   ```bash
   npm test -- --debug
   ```

## Next Steps

1. **Commit changes after each phase**:
   ```bash
   git add .
   git commit -m "fix: resolve testing library issues"
   ```

2. **Update documentation**:
   - Update `TESTING_GUIDE.md` with any new patterns
   - Add examples of fixed tests

3. **Create pull request**:
   - Link to this issue
   - Include test results
   - Document any breaking changes

## Success Criteria

- ✅ All tests pass without errors
- ✅ Test coverage maintained or improved
- ✅ No TypeScript compilation errors
- ✅ All accessibility requirements met
- ✅ Documentation updated

## Support

If you encounter issues:
1. Check `TESTING_FIX_PLAN.md` for detailed analysis
2. Run tests with `--verbose` flag for detailed output
3. Check TypeScript configuration in `tsconfig.json`
4. Verify Vitest configuration in `vitest.config.ts`