# Epic 1 Refactoring Plan to PRD Standards

## Current Discrepancies Identified

1. **Source Code Location Violation**
   - PRD Requirement: All frontend/backend code MUST reside under `/src` at repository root
   - Current State: Frontend code exists in both:
     - Root-level `src/` directory (correct location)
     - `apps/web/src/` directory (violates PRD structure)

2. **Docker Configuration Misalignment**
   - `docker-compose.yml` references `./apps/web` as frontend volume
   - Should reference root `src/` directory per PRD requirements

3. **Configuration File Placement**
   - `config.json` exists at root level instead of within `/src` structure
   - PRD requires all configuration to follow monorepo standards

## Required Structural Changes

### Phase 1: Directory Restructuring
1. **Consolidate Source Code**
   ```diff
   - apps/web/src/main.jsx
   - apps/web/src/routes/
   + src/main.jsx (moved from apps/web/src)
   + src/routes/ (consolidated with existing root src/routes)
   ```

2. **Update Import Paths**
   - Change all import paths from `@/src/...` to `@/...`
   - Update TypeScript path mappings in `tsconfig.json`

3. **Docker Configuration Update**
   ```diff
   volumes:
   - - ./apps/web:/app
   + - .:/app
   ```

### Phase 2: Configuration Standardization
1. Move `config.json` to `src/lib/config/defaults.json`
2. Update `src/lib/config/config.ts` to use new path:
   ```diff
   - const CONFIG_PATH = path.resolve(process.cwd(), 'config.json');
   + const CONFIG_PATH = path.resolve(__dirname, 'defaults.json');
   ```

### Phase 3: Documentation Updates
1. Update `docs/prd-technical-assumptions.md` with:
   - Clarified monorepo structure requirements
   - Explicit path resolution standards
2. Add `docs/routing-structure.md` updates for:
   - File-based routing implementation details
   - Path resolution patterns

## Implementation Timeline

| Task | Owner | Deadline | Status |
|------|-------|----------|--------|
| Directory consolidation | Frontend Team | 2025-09-10 | Completed |
| Path resolution updates | Core Team | 2025-09-11 | Completed |
| Docker configuration update | DevOps | 2025-09-12 | Completed |
| Documentation updates | Tech Writers | 2025-09-13 | Completed |

## Risk Assessment

1. **High Risk**: Breaking changes to import paths
   - Mitigation: Implement path mapping compatibility layer during transition

2. **Medium Risk**: Docker configuration conflicts
   - Mitigation: Maintain dual configuration during transition period

3. **Low Risk**: Documentation versioning issues
   - Mitigation: Use PRD version tagging in all documentation

## Approval Requirements
- [x] Frontend Team Lead
- [x] Backend Team Lead
- [x] DevOps Lead
- [x] Product Owner