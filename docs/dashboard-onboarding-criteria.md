# Dashboard Onboarding Criteria

Objective: Provide a clear, testable onboarding experience for first-time users to land on a personalized dashboard with guided tour.

Acceptance Criteria:
- The onboarding flow activates on first login or after reset, unless opted out.
- The onboarding includes 3-4 steps: Overview, Widgets, Personalization, Completion, with a skip option.
- On completion, the user sees a personalized dashboard and a confirmation.
- Onboarding progress is saved to the user profile or local storage; can resume.
- There is a "Don't show again" option to disable onboarding for the user.
- Analytics events are emitted: onboarding_start, tour_step_completed, onboarding_complete.
- Accessibility: onboarding UI is keyboard accessible with proper focus management.
- If onboarding fails, fallback to standard dashboard without blocking user.
- Documentation updates reflect MVP onboarding and future work.

Metrics:
- Percentage of new users who start onboarding.
- Completion rate of onboarding tour.
- Time to complete onboarding (mean and median).
- Engagement: percent of users who interact with each tour step.
- Activation: share of users reaching personalized dashboard after onboarding.

Definition of Done:
- All acceptance criteria met and testable.
- First-run detection and gating implemented.
- Welcome modal, guided tour, and progress persistence implemented.
- Routing gate ensures onboarding appears appropriately.
- Analytics events emitted and verifiable.
- Automated tests cover core onboarding flows.
- Documentation updated accordingly.