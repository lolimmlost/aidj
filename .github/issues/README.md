# AIDJ Roadmap GitHub Issues

This directory contains automatically generated GitHub issues from the [2025 Roadmap](../../docs/roadmap-2025.md).

## Overview

**Generated:** 2025-11-17
**Total Issues:** 25 (Phases 2-6)
**Status:** Ready for review and creation

## Structure

### Generated Files

- `SUMMARY.md` - Overview of all generated issues with statistics
- `create-all-issues.sh` - Bash script to create all issues on GitHub
- `0XX-{phase}-{priority}-{title}.md` - Individual issue files

### Issue Naming Convention

```
{number}-{phase}-{priority}-{slug}.md

Examples:
001-2-P1-mobile-optimization-touch-experience.md
015-4-P1-database-optimization.md
```

## Phase Breakdown

### Phase 1: Stabilization & Production Readiness (Manual)
**Timeline:** 4-6 weeks | **Priority:** CRITICAL

Phase 1 issues are **NOT** included in the automated generation because they require immediate attention and manual tracking. These should be created and prioritized first:

**Critical Tasks:**
1. Fix 5 failing Navidrome tests (87.8% → 95%+ pass rate)
2. Refactor large components (dashboard 1732 lines, audio player 775 lines)
3. Complete Lidarr integration (album lookup, availability checks)
4. Documentation cleanup (remove obsolete references)
5. Production deployment preparation (re-enable signup, health checks)

See [docs/roadmap-2025.md](../../docs/roadmap-2025.md#phase-1-stabilization--production-readiness-v09--v10) for detailed Phase 1 tasks.

### Phase 2: User Experience & Polish (5 issues)
**Timeline:** 6-8 weeks | **Focus:** Mobile optimization, accessibility

- 2x P1 (High Priority): Mobile optimization, WCAG 2.1 AA compliance
- 2x P2 (Medium): Advanced UI components, user onboarding
- 1x P3 (Low): Theming & customization

### Phase 3: Advanced Features (5 issues)
**Timeline:** 8-10 weeks | **Focus:** Social features, AI improvements

- 1x P1 (High): AI DJ mode enhancements
- 3x P2 (Medium): Collaborative features, analytics, smart playlists
- 1x P3 (Low): Multi-provider LLM support

### Phase 4: Performance & Scale (5 issues)
**Timeline:** 6-8 weeks | **Focus:** Optimization, monitoring

- 3x P1 (High): Database optimization, caching, monitoring
- 2x P2 (Medium): Audio streaming, frontend performance

### Phase 5: Advanced Integration & Ecosystem (5 issues)
**Timeline:** 6-8 weeks | **Focus:** Integrations, developer platform

- 2x P2 (Medium): Music service integrations, download management
- 3x P3 (Low): Smart home, API platform, plugin system

### Phase 6: Enterprise & Advanced Features (5 issues)
**Timeline:** 10-12 weeks | **Focus:** Enterprise readiness, scaling

- 2x P1 (High): Advanced security, platform scaling
- 2x P2 (Medium): Multi-user/orgs, recommendation engine v2
- 1x P3 (Low): Advanced audio analysis

## Usage

### Option 1: Create All Issues at Once

```bash
# Review the SUMMARY.md first
cat .github/issues/SUMMARY.md

# Create all issues (requires gh CLI and authentication)
bash .github/issues/create-all-issues.sh
```

### Option 2: Create Issues by Phase

```bash
# Generate issues for specific phases only
npx tsx scripts/generate-roadmap-issues.ts --dry-run --phase=2,3

# Then create them
bash .github/issues/create-all-issues.sh
```

### Option 3: Create Individual Issues

```bash
# Create a single issue from a file
gh issue create \
  --title "[Phase 2] Mobile Optimization & Touch Experience" \
  --body-file .github/issues/001-2-P1-mobile-optimization-touch-experience.md \
  --label "phase:2" \
  --label "priority:high" \
  --label "enhancement"
```

### Option 4: Review Before Creation

```bash
# Open each issue file and review
ls -1 .github/issues/*.md | grep -v "README\|SUMMARY" | xargs -I {} less {}

# Or use your editor
code .github/issues/
```

## Prerequisites

### For Creating Issues on GitHub

1. **GitHub CLI** - Install from https://cli.github.com/

```bash
# macOS
brew install gh

# Linux
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh
```

2. **Authentication**

```bash
# Authenticate with GitHub
gh auth login

# Verify authentication
gh auth status
```

3. **Repository Access**

```bash
# Verify you're in the correct repository
gh repo view

# Check issue creation permissions
gh api user --jq '.login'
```

## Customization

### Regenerate Issues

```bash
# Edit the roadmap
vim docs/roadmap-2025.md

# Regenerate all issues
npx tsx scripts/generate-roadmap-issues.ts --dry-run

# Review changes
git diff .github/issues/
```

### Modify Labels or Milestones

Edit `scripts/generate-roadmap-issues.ts`:

```typescript
const LABELS = {
  // Add custom labels here
  'custom-label': 'custom-label',
};
```

### Add Assignees

Modify the `create-all-issues.sh` script:

```bash
gh issue create \
  --title "..." \
  --body-file "..." \
  --assignee "@me"  # Add this line
```

## Issue Template

Each generated issue includes:

### Front Matter (YAML)
```yaml
---
title: "[Phase X] Feature Title"
labels:
  - phase:X
  - priority:high
  - enhancement
milestone: Phase X
---
```

### Body Sections
1. **Goal** - Phase objective and context
2. **Impact** - Expected benefits and user value
3. **Effort Estimate** - Time required (e.g., "2 weeks")
4. **Priority** - P0 (Critical), P1 (High), P2 (Medium), P3 (Low)
5. **Tasks** - Detailed checklist of work items
6. **Acceptance Criteria** - Definition of done
7. **Related Documentation** - Links to roadmap, architecture, etc.

## Statistics

### By Priority
- **P0 (Critical):** 0 (Phase 1 manual only)
- **P1 (High):** 8 issues
- **P2 (Medium):** 11 issues
- **P3 (Low):** 6 issues

### By Phase
- **Phase 1:** Manual creation required (5-7 critical issues)
- **Phase 2:** 5 issues (Mobile, UX, accessibility)
- **Phase 3:** 5 issues (Advanced features, AI)
- **Phase 4:** 5 issues (Performance, monitoring)
- **Phase 5:** 5 issues (Integrations, ecosystem)
- **Phase 6:** 5 issues (Enterprise, scaling)

### Effort Distribution
- **< 1 week:** 0 issues
- **1-2 weeks:** 13 issues
- **2-3 weeks:** 9 issues
- **3-4 weeks:** 3 issues
- **4+ weeks:** 0 issues (broken into smaller issues)

## Best Practices

### Before Creating Issues

1. **Review the roadmap** - Understand the vision and dependencies
2. **Check existing issues** - Avoid duplicates
3. **Set up milestones** - Create Phase 1-6 milestones on GitHub
4. **Configure labels** - Ensure all labels exist in your repository
5. **Plan capacity** - Don't create all issues if team capacity is limited

### After Creating Issues

1. **Triage Phase 1** - These are production blockers, prioritize immediately
2. **Set up project board** - Organize issues by phase and priority
3. **Assign owners** - Distribute work across team members
4. **Link PRs** - Connect pull requests to issues with "Closes #123"
5. **Update progress** - Keep issue status current (in-progress, blocked, etc.)

### During Development

1. **Reference issues in commits** - Use "refs #123" or "fixes #123"
2. **Update task checklists** - Check off completed items
3. **Add comments** - Document decisions, blockers, and discoveries
4. **Link related issues** - Connect dependent or related work
5. **Close when done** - Don't leave stale completed issues open

## Troubleshooting

### gh CLI not installed
```bash
# Install via package manager (see Prerequisites above)
brew install gh  # macOS
apt install gh   # Debian/Ubuntu
```

### Authentication failed
```bash
# Re-authenticate
gh auth logout
gh auth login

# Use token authentication if needed
gh auth login --with-token < token.txt
```

### Permission denied
```bash
# Check repository access
gh repo view

# Verify permissions
gh api repos/:owner/:repo --jq '.permissions'
```

### Milestone doesn't exist
```bash
# Create milestones first
gh api repos/:owner/:repo/milestones -f title="Phase 1" -f state="open"
gh api repos/:owner/:repo/milestones -f title="Phase 2" -f state="open"
# ... etc for all phases
```

### Label doesn't exist
```bash
# Create labels
gh label create "phase:1" --color "0052CC"
gh label create "priority:high" --color "D93F0B"
# ... etc for all labels
```

## Maintenance

### Quarterly Review

1. Update roadmap based on progress and learnings
2. Regenerate issues for upcoming phases
3. Archive completed issues
4. Adjust priorities based on user feedback
5. Add new phases or features as needed

### Documentation Updates

- Keep SUMMARY.md in sync with actual created issues
- Update effort estimates based on actual time spent
- Document lessons learned and blockers
- Maintain roadmap-2025.md with current state

## Related Files

- [scripts/generate-roadmap-issues.ts](../../scripts/generate-roadmap-issues.ts) - Generator script
- [docs/roadmap-2025.md](../../docs/roadmap-2025.md) - Source roadmap
- [docs/backlog.md](../../docs/backlog.md) - Current backlog and story status
- [docs/architecture.md](../../docs/architecture.md) - Technical architecture
- [.github/workflows/](../../.github/workflows/) - CI/CD configuration

## Support

For questions or issues with the roadmap or issue generation:

1. Review [docs/roadmap-2025.md](../../docs/roadmap-2025.md) for context
2. Check [docs/backlog.md](../../docs/backlog.md) for current priorities
3. Open a discussion on GitHub Discussions
4. Reach out to the maintainers

---

**Last Updated:** 2025-11-17
**Version:** 1.0
**Maintainer:** AIDJ Development Team
