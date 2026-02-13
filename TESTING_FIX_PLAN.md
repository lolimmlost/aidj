# Testing Fix Plan for Download Request Interface

## Overview
This document outlines the specific issues found in the test files and provides a comprehensive plan to fix them. The issues are categorized by priority and include detailed instructions for resolution.

## ✅ RESOLVED ISSUES

### 1. Testing Library Issues (HIGH PRIORITY) - ✅ COMPLETED

#### Issues Fixed:
- **File**: `src/components/__tests__/search-interface.test.tsx`
- **Line 62**: `screen.getByRole('button')` - Ambiguous button selection
- **Line 72**: `screen.getAllByRole('button')[0]` - Unclear which button is being selected
- **Missing**: Proper accessibility attributes in components

#### Solutions Applied:
1. **Updated test queries to be more specific**:
    ```typescript
    // Fixed:
    const clearButton = screen.getByRole('button', { name: /clear search/i });
    const searchButton = screen.getByRole('button', { name: /^search$/i });
    ```

2. **Added proper accessibility attributes to components**:
    - Added `aria-label` to buttons
    - Added `aria-describedby` for form instructions
    - Ensured all interactive elements are keyboard accessible

#### Files Modified:
- ✅ `src/components/__tests__/search-interface.test.tsx`
- ✅ `src/components/ui/search-interface.tsx`

### 2. Vitest Mock Issues (HIGH PRIORITY) - ✅ COMPLETED

#### Issues Fixed:
- **File**: `src/lib/services/__tests__/lidarr.test.ts`
- **Line 34**: `vi.mocked(fetch)` - Proper mock typing needed
- **Line 15**: `vi.spyOn(getConfig, 'default')` - Mock setup issue

#### Solutions Applied:
1. **Fixed mock typing**:
    ```typescript
    // Fixed:
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      redirected: false,
      type: 'basic',
      url: 'http://localhost:8686/api/v1/artist/lookup?term=test',
      json: vi.fn().mockResolvedValue(mockResponse),
      clone: vi.fn(),
      text: vi.fn(),
      blob: vi.fn(),
      formData: vi.fn(),
      arrayBuffer: vi.fn(),
    } as unknown as Response);
    ```

2. **Corrected spy setup**:
    ```typescript
    // Fixed:
    vi.spyOn(getConfig, 'default').mockReturnValue(mockConfig);
    ```

#### Files Modified:
- ✅ `src/lib/services/__tests__/lidarr.test.ts`
- ✅ `src/lib/services/__tests__/ollama.test.ts`
- ✅ `src/lib/services/__tests__/service-chain.test.ts`

### 3. TypeScript Issues (MEDIUM PRIORITY) - ✅ COMPLETED

#### Issues Fixed:
- Missing proper type definitions for some interfaces
- Import/export statement issues
- `any()` type usage

#### Solutions Applied:
1. **Added proper type definitions**:
    ```typescript
    // Added:
    interface MockResponse {
      ok: boolean;
      json: () => Promise<any>;
    }
    ```

2. **Fixed import/export statements**:
    ```typescript
    // Fixed:
    import { searchArtists, searchAlbums } from '../lidarr';
    ```

3. **Replaced `any()` types**:
    ```typescript
    // Fixed:
    interface SearchResult {
      id: string;
      name: string;
      type: 'artist' | 'album';
    }
    const result: SearchResult[] = await response.json();
    ```

#### Files Modified:
- ✅ `src/lib/services/__tests__/lidarr.test.ts`
- ✅ `src/components/__tests__/search-interface.test.tsx`
- ✅ `src/lib/services/__tests__/download-request.test.ts`

### 4. Component Issues (MEDIUM PRIORITY) - ✅ COMPLETED

#### Issues Fixed:
- Some undefined function references in components
- Missing prop types
- Unused props

#### Solutions Applied:
1. **Added proper prop types**:
    ```typescript
    // Added:
    interface ComponentProps {
      onSearch: (query: string) => void;
      loading?: boolean;
      className?: string;
    }
    ```

2. **Fixed undefined function references**:
    ```typescript
    // Fixed:
    import { handleSearch } from './utils';
    ```

3. **Ensured all props are used**:
    - Added `React.FC` type to components
    - Used `React.useCallback` for event handlers

#### Files Modified:
- ✅ `src/components/ui/search-interface.tsx`
- ✅ `src/components/ui/download-request.tsx`

### 5. Async Test Issues (MEDIUM PRIORITY) - ✅ COMPLETED

#### Issues Fixed:
- Missing proper timeouts for async operations
- Missing `vi.advanceTimersByTimeAsync()` for timer control
- Improper mock fetch calls setup

#### Solutions Applied:
1. **Added proper timeouts for async operations**:
    ```typescript
    // Added:
    }, 10000); // Add timeout for async operation
    ```

2. **Used `vi.advanceTimersByTimeAsync()` for timer control**:
    ```typescript
    // Added:
    await vi.advanceTimersByTimeAsync(150);
    ```

3. **Ensured mock fetch calls are properly set up**:
    ```typescript
    // Fixed:
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      redirected: false,
      type: 'basic',
      url: 'http://localhost:8686/api/v1/artist/lookup?term=test',
      json: vi.fn().mockResolvedValue(mockResponse),
      clone: vi.fn(),
      text: vi.fn(),
      blob: vi.fn(),
      formData: vi.fn(),
      arrayBuffer: vi.fn(),
    } as unknown as Response));
    ```

#### Files Modified:
- ✅ `src/lib/services/__tests__/lidarr.test.ts`
- ✅ `src/lib/services/__tests__/ollama.test.ts`
- ✅ `src/lib/services/__tests__/service-chain.test.ts`
- ✅ `src/lib/performance/__tests__/mobile-optimization.test.ts`

### 6. Service Test Issues (MEDIUM PRIORITY) - ✅ COMPLETED

#### Issues Fixed:
- Missing test file for download-request service
- Mock paths for external dependencies
- API response structures not matching expected types
- Missing proper error handling for network failures

#### Solutions Applied:
1. **Created comprehensive test file for download-request service**:
    ```typescript
    // Created:
    src/lib/services/__tests__/download-request.test.ts
    ```

2. **Fixed mock paths for external dependencies**:
    ```typescript
    // Fixed:
    vi.mock('../../config/config');
    vi.mock('../lidarr');
    vi.mock('../../db');
    ```

3. **Ensured API response structures match expected types**:
    ```typescript
    // Added proper typing:
    interface DownloadRequestData {
      userId: string;
      requestType: 'artist' | 'album' | 'song';
      artistName: string;
      albumTitle?: string;
      title?: string;
      searchQuery?: string;
      notifyOnComplete?: boolean;
      notifyOnError?: boolean;
    }
    ```

4. **Added proper error handling for network failures**:
    ```typescript
    // Added:
    } catch (error) {
      console.error('Error creating download request:', error);
      throw new ServiceError(
        'REQUEST_CREATION_FAILED',
        `Failed to create download request: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
    ```

#### Files Modified:
- ✅ `src/lib/services/__tests__/download-request.test.ts`
- ✅ `src/lib/services/__tests__/lidarr.test.ts`
- ✅ `src/lib/services/__tests__/ollama.test.ts`
- ✅ `src/lib/services/__tests__/navidrome.test.ts`

## ✅ IMPLEMENTATION SUMMARY

### Completed Tasks:
1. ✅ Fixed Testing Library Issues (HIGH PRIORITY)
2. ✅ Fixed Vitest Mock Issues (HIGH PRIORITY)
3. ✅ Fixed TypeScript Issues (MEDIUM PRIORITY)
4. ✅ Fixed Component Issues (MEDIUM PRIORITY)
5. ✅ Fixed Async Test Issues (MEDIUM PRIORITY)
6. ✅ Fixed Service Test Issues (MEDIUM PRIORITY)

### Files Modified:
- `src/components/__tests__/search-interface.test.tsx`
- `src/components/ui/search-interface.tsx`
- `src/lib/services/__tests__/lidarr.test.ts`
- `src/lib/services/__tests__/ollama.test.ts`
- `src/lib/services/__tests__/service-chain.test.ts`
- `src/lib/services/__tests__/download-request.test.ts`
- `src/lib/performance/__tests__/mobile-optimization.test.ts`

## ✅ SUCCESS CRITERIA MET
- ✅ All test files have been updated with proper testing library queries
- ✅ All mock setups have been corrected with proper typing
- ✅ All TypeScript issues have been resolved
- ✅ All components have proper prop types and accessibility attributes
- ✅ All async tests have proper timeouts and timer controls
- ✅ Service tests have been created and properly configured
- ✅ Comprehensive test coverage for download-request service

## ✅ NEXT STEPS
1. ✅ Run tests after each fix to verify
2. ✅ Update TESTING_FIX_PLAN.md with resolved issues
3. ✅ Communicate completion to the team

## ✅ RISK MITIGATION
- ✅ Worked in small, incremental changes
- ✅ Applied fixes systematically across all test files
- ✅ Maintained proper TypeScript typing throughout
- ✅ Ensured all accessibility requirements are met
- ✅ Created comprehensive test coverage for new functionality

## ✅ DOCUMENTATION UPDATED
This document has been updated to reflect all resolved issues and provide a clear record of the fixes applied.