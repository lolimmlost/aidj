# AIDJ Documentation Index

This README serves as a central index for all project documentation in the /docs/ directory. Documents are organized by category to improve navigation and cohesiveness. For the core Product Requirements Document (PRD), refer to the sharded structure starting with [prd.md](prd.md).

## 1. Product Requirements Document (PRD)
The PRD is sharded for maintainability. See [prd.md](prd.md) for the overview and links.
- [prd.md](prd.md) - Main PRD index and sharded document overview
- [prd-goals.md](prd-goals.md) - Project goals and background context
- [prd-requirements.md](prd-requirements.md) - Functional and non-functional requirements
- [prd-ui-design.md](prd-ui-design.md) - User interface design goals
- [prd-technical-assumptions.md](prd-technical-assumptions.md) - Technical assumptions and standards (updated for PostgreSQL)
- [prd-epic-1.md](prd-epic-1.md) - Epic 1: Foundation & Core Infrastructure (Completed)
- [prd-epic-2.md](prd-epic-2.md) - Epic 2: Music Library Integration (Completed)
- [prd-epic-3.md](prd-epic-3.md) - Epic 3: AI Recommendations Engine (Planned)
- [prd-epic-4.md](prd-epic-4.md) - Epic 4: Download Management (Deferred, with mock UI)
- [prd-epic-5.md](prd-epic-5.md) - Epic 5: Unified User Experience (In Progress)
- [project-brief.md](project-brief.md) - High-level project overview and MVP scope
- [backlog.md](backlog.md) - Detailed story backlog with points and statuses (updated for Epic 4 mock)

## 2. Architecture and Technical Specifications
- [architecture.md](architecture.md) - Fullstack architecture document (implemented features: auth, Navidrome)
- [architecture-update.md](architecture-update.md) - Schema and architecture updates needed
- [front-end-spec.md](front-end-spec.md) - UI/UX specifications, wireframes, and design system
- [technical-requirements.md](technical-requirements.md) - Detailed technical requirements for integrations (Navidrome, Ollama)
- [routing-structure.md](routing-structure.md) - File-based routing standards and organization
- [implementation-tasks.md](implementation-tasks.md) - Actionable implementation tasks by component

## 3. Development and Operations
- [ci-cd-validation.md](ci-cd-validation.md) - CI/CD pipeline setup and validation guide
- [refactoring-plan-epic1.md](refactoring-plan-epic1.md) - Epic 1 refactoring to PRD standards (Completed)
- [environment-configuration.md](environment-configuration.md) - Environment setup and variables
- [testing-framework-integration.md](testing-framework-integration.md) - Testing setup and best practices

## 4. Product Validation and Onboarding
- [po-master-validation-report.md](po-master-validation-report.md) - Master Product Owner validation report
- [po-checklist-evaluation-section-1.md](po-checklist-evaluation-section-1.md) to [po-checklist-evaluation-section-10.md](po-checklist-evaluation-section-10.md) - Section-specific PO checklists
- [dashboard-onboarding-criteria.md](dashboard-onboarding-criteria.md) - Dashboard onboarding criteria
- [dashboard-onboarding-notes.md](dashboard-onboarding-notes.md) - Onboarding notes and feedback
- [dashboard-onboarding-wireframes.md](dashboard-onboarding-wireframes.md) - Onboarding wireframes

## 5. Additional References
- [backlog-documentation.md](backlog-documentation.md) - Backlog management documentation
- [epic-1-completion-review.md](epic-1-completion-review.md) - Epic 1 completion review
- [SEARCH_USAGE_GUIDELINES.md](SEARCH_USAGE_GUIDELINES.md) - Search usage guidelines and service documentation
- [prd-po-review.md](prd-po-review.md) - Product Owner PRD review
- [prd-qa-review.md](prd-qa-review.md) - QA PRD review
- [prd-sharding-summary.md](prd-sharding-summary.md) - PRD sharding rationale
- [api-routes.md](api-routes.md) - API routes documentation

## Navigation Tips
- **Start Here**: [project-brief.md](project-brief.md) for high-level context, then [prd.md](prd.md) for requirements.
- **Technical Deep Dive**: [architecture.md](architecture.md) and [technical-requirements.md](technical-requirements.md).
- **Current Progress**: Check [backlog.md](backlog.md) for story statuses.
- **Updates**: All docs should reference related files (e.g., epics link to backlog). For changes, update the changelog in individual files.

Last Updated: 2025-09-14 by Product Manager