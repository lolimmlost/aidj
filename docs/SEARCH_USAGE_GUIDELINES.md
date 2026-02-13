# Search Usage Guidelines

## Overview

This document outlines the correct usage of different search services in the application to ensure optimal performance and user experience.

## Search Services

### 1. Navidrome Search (`/api/search`)
- **Purpose**: Primary search for music library browsing
- **Usage**: `/dashboard/search` area, library search functionality
- **Implementation**: Direct search against Navidrome music library
- **Status**: ✅ Working and stable

### 2. Integrated Search (`/api/integrated/search`)
- **Purpose**: Cross-service search with availability checking
- **Usage**: AI recommendations and playlist generation only
- **Implementation**: Searches both Lidarr and Navidrome services
- **Status**: ⚠️ Encrypted storage not working (backlog item)

## Correct Usage Patterns

### ✅ Recommended Usage

#### 1. Dashboard/Library Search (`/library/search`)
```typescript
// Use Navidrome search for direct library browsing
import { search } from '@/lib/services/navidrome';

const results = await search(query, 0, 50);
```
- **Route**: `/library/search`
- **API**: `/api/search`
- **Service**: Navidrome only
- **Purpose**: User-initiated library searches

#### 2. AI Recommendations
```typescript
// Use integrated search for AI recommendations
import { enhancedSearch } from '@/lib/services/lidarr-navidrome';

const results = await enhancedSearch(query);
```
- **Route**: `/dashboard/recommendations`
- **API**: `/api/integrated/search` (enhanced=true)
- **Service**: Integrated search
- **Purpose**: AI-generated recommendations with availability checking

#### 3. Playlist Generation
```typescript
// Use integrated search for playlist generation
import { integratedSearch } from '@/lib/services/lidarr-navidrome';

const results = await integratedSearch(query);
```
- **Route**: `/dashboard/` (style-based playlists)
- **API**: `/api/integrated/search`
- **Service**: Integrated search
- **Purpose**: Query-based playlist generation with availability checking

### ❌ Incorrect Usage

#### Dashboard Search Area
- **Do NOT use** integrated search in `/dashboard/search` area
- **Reason**: Performance overhead and unnecessary complexity for simple library browsing
- **Correct approach**: Use Navidrome search for faster, more reliable results

## Current Implementation Status

### Working Features
- ✅ Navidrome search for library browsing
- ✅ AI recommendations using integrated search
- ✅ Playlist generation using integrated search
- ✅ Error handling and fallback mechanisms

### Backlog Items
- 🔨 Encrypted storage for user preferences (currently using localStorage)
- 🔨 Enhanced availability checking for Lidarr songs

## Search Flow Architecture

```
User Action → Search Type → API Endpoint → Service → Result
─────────────────────────────────────────────────────────────
Library Search → Navidrome → /api/search → Navidrome → Songs
AI Recs → Enhanced → /api/integrated/search → Both → Recs + Availability
Playlist → Basic → /api/integrated/search → Both → Playlist + Availability
```

## Performance Considerations

### Navidrome Search
- **Response Time**: Fast (< 2s typical)
- **Cache**: Mobile-optimized caching enabled
- **Use Case**: Direct library browsing, user searches

### Integrated Search
- **Response Time**: Slower (3-5s typical due to cross-service calls)
- **Cache**: Enhanced caching with availability data
- **Use Case**: AI features, playlist generation, availability checking

## Error Handling

### Navidrome Search Errors
- Authentication failures
- Network timeouts
- Invalid queries

### Integrated Search Errors
- Service availability issues
- Cross-service sync problems
- Enhanced search feature limitations

## Future Enhancements

1. **Encrypted Storage**: Implement secure user preference storage
2. **Lidarr Integration**: Enhanced song availability checking
3. **Performance Optimization**: Reduce integrated search response time
4. **Caching Strategy**: Improved cache invalidation and refresh

## Development Guidelines

When implementing new search features:

1. **Always use Navidrome search** for direct library browsing
2. **Only use integrated search** for AI and playlist features
3. **Consider performance implications** of cross-service searches
4. **Implement proper error handling** for both search types
5. **Follow the established patterns** in existing code

## Testing Requirements

- Unit tests for both search services
- Integration tests for search API endpoints
- E2E tests for search functionality in UI
- Performance tests for search response times
- Error scenario testing for both services

---

*Last Updated: 2025-09-24*
*Status: Active - Implementation aligned with guidelines*