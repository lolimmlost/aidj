#!/bin/bash

# GitHub Issues Creation Script
# Generated from roadmap-2025.md

set -e

echo "🚀 Creating GitHub issues from roadmap..."
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
  echo "❌ GitHub CLI (gh) is not installed"
  echo "Install it from: https://cli.github.com/"
  exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
  echo "❌ Not authenticated with GitHub"
  echo "Run: gh auth login"
  exit 1
fi

ISSUE_DIR="$(dirname "$0")"
CREATED=0
FAILED=0

echo "📌 Creating Phase 2 issues..."

echo "  - [Phase 2] Mobile Optimization & Touch Experience..."
if gh issue create \
  --title "[Phase 2] Mobile Optimization & Touch Experience" \
  --body-file "$ISSUE_DIR/001-2-P1-mobile-optimization-touch-experience.md" \
  --label "phase:2" \
  --label "priority:high" \
  --label "performance" \
  --label "status:ready" \
  --milestone "Phase 2" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 2] Accessibility Improvements (WCAG 2.1 AA)..."
if gh issue create \
  --title "[Phase 2] Accessibility Improvements (WCAG 2.1 AA)" \
  --body-file "$ISSUE_DIR/002-2-P1-accessibility-improvements-wcag-2-1-aa.md" \
  --label "phase:2" \
  --label "priority:high" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 2" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 2] Advanced UI Components..."
if gh issue create \
  --title "[Phase 2] Advanced UI Components" \
  --body-file "$ISSUE_DIR/003-2-P2-advanced-ui-components.md" \
  --label "phase:2" \
  --label "priority:medium" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 2" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 2] User Onboarding & Help System..."
if gh issue create \
  --title "[Phase 2] User Onboarding & Help System" \
  --body-file "$ISSUE_DIR/004-2-P2-user-onboarding-help-system.md" \
  --label "phase:2" \
  --label "priority:medium" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 2" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 2] Theming & Customization..."
if gh issue create \
  --title "[Phase 2] Theming & Customization" \
  --body-file "$ISSUE_DIR/005-2-P3-theming-customization.md" \
  --label "phase:2" \
  --label "priority:low" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 2" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi
echo ""

echo "📌 Creating Phase 3 issues..."

echo "  - [Phase 3] Collaborative Features..."
if gh issue create \
  --title "[Phase 3] Collaborative Features" \
  --body-file "$ISSUE_DIR/006-3-P2-collaborative-features.md" \
  --label "phase:3" \
  --label "priority:medium" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 3" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 3] Advanced Analytics Dashboard..."
if gh issue create \
  --title "[Phase 3] Advanced Analytics Dashboard" \
  --body-file "$ISSUE_DIR/007-3-P2-advanced-analytics-dashboard.md" \
  --label "phase:3" \
  --label "priority:medium" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 3" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 3] AI DJ Mode Enhancements..."
if gh issue create \
  --title "[Phase 3] AI DJ Mode Enhancements" \
  --body-file "$ISSUE_DIR/008-3-P1-ai-dj-mode-enhancements.md" \
  --label "phase:3" \
  --label "priority:high" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 3" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 3] Smart Playlist Intelligence..."
if gh issue create \
  --title "[Phase 3] Smart Playlist Intelligence" \
  --body-file "$ISSUE_DIR/009-3-P2-smart-playlist-intelligence.md" \
  --label "phase:3" \
  --label "priority:medium" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 3" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 3] Multi-Provider LLM Support..."
if gh issue create \
  --title "[Phase 3] Multi-Provider LLM Support" \
  --body-file "$ISSUE_DIR/010-3-P3-multi-provider-llm-support.md" \
  --label "phase:3" \
  --label "priority:low" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 3" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi
echo ""

echo "📌 Creating Phase 4 issues..."

echo "  - [Phase 4] Database Optimization..."
if gh issue create \
  --title "[Phase 4] Database Optimization" \
  --body-file "$ISSUE_DIR/011-4-P1-database-optimization.md" \
  --label "phase:4" \
  --label "priority:high" \
  --label "performance" \
  --label "status:ready" \
  --milestone "Phase 4" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 4] Caching Strategy Enhancement..."
if gh issue create \
  --title "[Phase 4] Caching Strategy Enhancement" \
  --body-file "$ISSUE_DIR/012-4-P1-caching-strategy-enhancement.md" \
  --label "phase:4" \
  --label "priority:high" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 4" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 4] Audio Streaming Optimization..."
if gh issue create \
  --title "[Phase 4] Audio Streaming Optimization" \
  --body-file "$ISSUE_DIR/013-4-P2-audio-streaming-optimization.md" \
  --label "phase:4" \
  --label "priority:medium" \
  --label "performance" \
  --label "status:ready" \
  --milestone "Phase 4" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 4] Frontend Performance..."
if gh issue create \
  --title "[Phase 4] Frontend Performance" \
  --body-file "$ISSUE_DIR/014-4-P2-frontend-performance.md" \
  --label "phase:4" \
  --label "priority:medium" \
  --label "performance" \
  --label "status:ready" \
  --milestone "Phase 4" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 4] Monitoring & Observability..."
if gh issue create \
  --title "[Phase 4] Monitoring & Observability" \
  --body-file "$ISSUE_DIR/015-4-P1-monitoring-observability.md" \
  --label "phase:4" \
  --label "priority:high" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 4" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi
echo ""

echo "📌 Creating Phase 5 issues..."

echo "  - [Phase 5] Music Service Integrations..."
if gh issue create \
  --title "[Phase 5] Music Service Integrations" \
  --body-file "$ISSUE_DIR/016-5-P2-music-service-integrations.md" \
  --label "phase:5" \
  --label "priority:medium" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 5" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 5] Smart Home Integration..."
if gh issue create \
  --title "[Phase 5] Smart Home Integration" \
  --body-file "$ISSUE_DIR/017-5-P3-smart-home-integration.md" \
  --label "phase:5" \
  --label "priority:low" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 5" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 5] Advanced Download Management..."
if gh issue create \
  --title "[Phase 5] Advanced Download Management" \
  --body-file "$ISSUE_DIR/018-5-P2-advanced-download-management.md" \
  --label "phase:5" \
  --label "priority:medium" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 5" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 5] API & Developer Platform..."
if gh issue create \
  --title "[Phase 5] API & Developer Platform" \
  --body-file "$ISSUE_DIR/019-5-P3-api-developer-platform.md" \
  --label "phase:5" \
  --label "priority:low" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 5" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 5] Plugin System..."
if gh issue create \
  --title "[Phase 5] Plugin System" \
  --body-file "$ISSUE_DIR/020-5-P3-plugin-system.md" \
  --label "phase:5" \
  --label "priority:low" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 5" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi
echo ""

echo "📌 Creating Phase 6 issues..."

echo "  - [Phase 6] Multi-User & Organizations..."
if gh issue create \
  --title "[Phase 6] Multi-User & Organizations" \
  --body-file "$ISSUE_DIR/021-6-P2-multi-user-organizations.md" \
  --label "phase:6" \
  --label "priority:medium" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 6" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 6] Advanced Security..."
if gh issue create \
  --title "[Phase 6] Advanced Security" \
  --body-file "$ISSUE_DIR/022-6-P1-advanced-security.md" \
  --label "phase:6" \
  --label "priority:high" \
  --label "security" \
  --label "status:ready" \
  --milestone "Phase 6" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 6] Advanced Audio Analysis..."
if gh issue create \
  --title "[Phase 6] Advanced Audio Analysis" \
  --body-file "$ISSUE_DIR/023-6-P3-advanced-audio-analysis.md" \
  --label "phase:6" \
  --label "priority:low" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 6" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 6] Recommendation Engine V2..."
if gh issue create \
  --title "[Phase 6] Recommendation Engine V2" \
  --body-file "$ISSUE_DIR/024-6-P2-recommendation-engine-v2.md" \
  --label "phase:6" \
  --label "priority:medium" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 6" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi

echo "  - [Phase 6] Platform Scaling..."
if gh issue create \
  --title "[Phase 6] Platform Scaling" \
  --body-file "$ISSUE_DIR/025-6-P1-platform-scaling.md" \
  --label "phase:6" \
  --label "priority:high" \
  --label "enhancement" \
  --label "status:ready" \
  --milestone "Phase 6" \
  > /dev/null 2>&1; then
  ((CREATED++))
else
  ((FAILED++))
  echo "    ❌ Failed to create issue"
fi
echo ""

echo "✅ Created $CREATED issues"
if [ $FAILED -gt 0 ]; then
  echo "❌ Failed to create $FAILED issues"
  exit 1
fi

echo ""
echo "🎉 All issues created successfully!"
echo "View them at: $(gh repo view --json url -q .url)/issues"
