# MVP Onboarding Notes

Purpose:
- Capture MVP scope for dashboard onboarding and provide a single source of truth for the team.

MVP scope:
- Detect first-run and gate onboarding
- Welcome modal on first run
- Guided tour with 3 steps: Overview, Widgets, Personalization; Completion
- Persist onboarding progress (local storage or user profile)
- Do not block access to dashboard if onboarding incomplete
- Basic analytics events: onboarding_start, tour_step_complete, onboarding_complete
- Accessibility: keyboard navigable

Non-MVP scope (for future):
- Advanced personalization
- In-depth analytics dashboards
- Multi-language support

Assumptions:
- UI components exist or will be created in the MVP
- Authentication present

Constraints:
- MVP should not degrade performance
- Must work offline? Not required

Acceptance criteria (MVP):
- A concise doc exists and is up to date
- Onboarding triggers on first login
- Welcome modal appears
- Tour steps accessible
- Progress persists
- Basic analytics fired
- "Don't show again" option available
- Route gating implemented at MVP level
- Simple tests or checks exist in repo? (Optional)

Definition of Done:
- Document created and reviewed
- Backlog items updated to reflect MVP scope

Risks:
- Mis-timed gating causing confusion
- Incomplete persistence causing lost progress

Dependencies:
- UI components for modal and tour