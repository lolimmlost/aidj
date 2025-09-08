# Routing Structure Implementation

## File-Based Routing Standards

All routes must follow the standardized path resolution patterns:
- Use absolute imports from root: `import { Component } from '@/components/ui`
- Path mapping: `@/` resolves to `/src` directory
- Route files must be placed in `/src/routes` with no nested route directories deeper than 3 levels

## Route Organization

```
src/routes/
├── __root.tsx            # Root layout with theme provider
├── index.tsx             # Dashboard entry point
├── login.tsx             # Authentication interface
├── library/
│   ├── index.tsx         # Library overview with service integration
│   ├── artists.tsx       # Artist management with API hooks
│   ├── albums.tsx        # Album browsing with lazy loading
│   └── songs.tsx         # Song catalog with search functionality
├── recommendations/
│   ├── index.tsx         # AI recommendations feed
│   └── [id].tsx         # Recommendation details with analytics tracking
├── downloads/
│   ├── index.tsx         # Download queue management
│   └── history.tsx       # Download history with filtering
└── settings/
    ├── index.tsx         # Settings overview
    ├── profile.tsx       # User profile management
    └── services.tsx      # Service configuration with validation
```

## Implementation Requirements

1. **Authentication Integration**
   - All routes must implement `useAuth()` hook for access control
   - Protected routes should be wrapped in `auth` layout directory

2. **Path Resolution**
   - Update all route imports to use standardized path mapping
   - Replace relative imports (`../components`) with absolute imports (`@/components`)
   - Explicit Instructions: In tsconfig.json, maintain "paths": { "@/*": ["src/*"] }. All imports must use @/ for components, utils, lib, etc. Avoid relative paths across directories to prevent breakage during monorepo consolidation. Use Vite's path alias resolution for build-time consistency.

3. **Documentation Updates**
   - Add explicit path resolution instructions
   - Document route directory depth limitations
   - Specify service integration requirements for each route type

**Route Directory Depth Limitations**: Routes limited to 3 levels max (e.g., /library/artists/albums). Deeper nesting should use dynamic segments ([id].tsx) or sub-routes to maintain performance and readability.

**Service Integration Requirements**:
- Library routes (/library/*): Integrate Navidrome API for artist/album/song data, with auth tokens from config.
- Recommendations routes (/recommendations/*): Use Ollama API for AI-generated suggestions, with error fallback to cached data.
- Downloads routes (/downloads/*): Lidarr API for queue management, with progress tracking via WebSockets if possible.
- All routes must check service connectivity from config and show status indicators if offline.