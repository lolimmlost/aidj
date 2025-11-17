#!/usr/bin/env tsx

/**
 * GitHub Issues Generator for AIDJ Roadmap
 *
 * This script generates GitHub issues from the roadmap document.
 * It creates properly formatted issues with labels, milestones, and priorities.
 *
 * Usage:
 *   pnpm tsx scripts/generate-roadmap-issues.ts [--dry-run] [--phase=1,2,3]
 *
 * Options:
 *   --dry-run       Generate issue files without creating GitHub issues
 *   --phase         Only generate issues for specific phases (comma-separated)
 *   --output-dir    Output directory for generated issue files (default: .github/issues)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Types & Interfaces
// ============================================================================

interface Issue {
  title: string;
  body: string;
  labels: string[];
  milestone?: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  phase: string;
  effort: string;
  section: string;
}

interface PhaseInfo {
  phase: string;
  title: string;
  timeline: string;
  goal: string;
}

// ============================================================================
// Configuration
// ============================================================================

const LABELS = {
  // Type labels
  enhancement: 'enhancement',
  bug: 'bug',
  documentation: 'documentation',
  performance: 'performance',
  security: 'security',
  testing: 'testing',
  refactor: 'refactor',

  // Priority labels
  'priority:critical': 'priority:critical',
  'priority:high': 'priority:high',
  'priority:medium': 'priority:medium',
  'priority:low': 'priority:low',

  // Phase labels
  'phase:1': 'phase:1',
  'phase:2': 'phase:2',
  'phase:3': 'phase:3',
  'phase:4': 'phase:4',
  'phase:5': 'phase:5',
  'phase:6': 'phase:6',

  // Size labels
  'size:small': 'size:small',
  'size:medium': 'size:medium',
  'size:large': 'size:large',
  'size:xlarge': 'size:xlarge',

  // Status labels
  'status:ready': 'status:ready',
  'status:blocked': 'status:blocked',
  'status:in-progress': 'status:in-progress',
};

const ROADMAP_FILE = path.join(__dirname, '..', 'docs', 'roadmap-2025.md');
const OUTPUT_DIR = path.join(__dirname, '..', '.github', 'issues');

// ============================================================================
// Roadmap Parser
// ============================================================================

class RoadmapParser {
  private content: string;
  private issues: Issue[] = [];
  private currentPhase: PhaseInfo | null = null;

  constructor(filePath: string) {
    this.content = fs.readFileSync(filePath, 'utf-8');
  }

  parse(): Issue[] {
    const lines = this.content.split('\n');
    let currentSection: string | null = null;
    let inSection = false;
    let sectionContent: string[] = [];
    let sectionTitle = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect phase headers
      const phaseMatch = line.match(/^## Phase (\d+):\s*(.+?)\s*\(v[\d.]+\)$/);
      if (phaseMatch) {
        const phaseNum = phaseMatch[1];
        const phaseTitle = phaseMatch[2];

        // Extract timeline and goal from next lines
        let timeline = '';
        let goal = '';
        if (lines[i + 1]?.startsWith('**Timeline:**')) {
          timeline = lines[i + 1].replace('**Timeline:**', '').trim();
        }
        if (lines[i + 2]?.startsWith('**Goal:**')) {
          goal = lines[i + 2].replace('**Goal:**', '').trim();
        }

        this.currentPhase = {
          phase: `Phase ${phaseNum}`,
          title: phaseTitle,
          timeline,
          goal
        };
        continue;
      }

      // Detect section headers (###)
      const sectionMatch = line.match(/^### ([\d.]+)\s+(.+)$/);
      if (sectionMatch) {
        // Save previous section
        if (inSection && sectionContent.length > 0) {
          this.parseSection(currentSection!, sectionTitle, sectionContent);
        }

        // Start new section
        currentSection = sectionMatch[1];
        sectionTitle = sectionMatch[2];
        inSection = true;
        sectionContent = [];
        continue;
      }

      // Collect section content
      if (inSection && line.trim()) {
        sectionContent.push(line);
      }

      // End of section (empty line after content)
      if (inSection && !line.trim() && sectionContent.length > 0) {
        this.parseSection(currentSection!, sectionTitle, sectionContent);
        inSection = false;
        sectionContent = [];
        currentSection = null;
      }
    }

    // Handle last section
    if (inSection && sectionContent.length > 0) {
      this.parseSection(currentSection!, sectionTitle, sectionContent);
    }

    return this.issues;
  }

  private parseSection(sectionNum: string, title: string, content: string[]): void {
    if (!this.currentPhase) return;

    let priority: Issue['priority'] = 'P2';
    let effort = '';
    let impact = '';
    const tasks: string[] = [];

    // Parse content
    for (const line of content) {
      if (line.startsWith('- **Priority:**')) {
        const priorityText = line.replace('- **Priority:**', '').trim().toUpperCase();
        if (priorityText.includes('CRITICAL')) priority = 'P0';
        else if (priorityText.includes('HIGH')) priority = 'P1';
        else if (priorityText.includes('MEDIUM')) priority = 'P2';
        else if (priorityText.includes('LOW')) priority = 'P3';
      } else if (line.startsWith('- **Effort:**')) {
        effort = line.replace('- **Effort:**', '').trim();
      } else if (line.startsWith('- **Impact:**')) {
        impact = line.replace('- **Impact:**', '').trim();
      } else if (line.startsWith('- ') && !line.includes('**')) {
        tasks.push(line.substring(2).trim());
      }
    }

    // Generate issue body
    const body = this.generateIssueBody({
      phase: this.currentPhase,
      sectionNum,
      title,
      priority,
      effort,
      impact,
      tasks
    });

    // Determine labels
    const labels = this.determineLabels(title, priority, this.currentPhase.phase);

    this.issues.push({
      title: `[${this.currentPhase.phase}] ${title}`,
      body,
      labels,
      milestone: this.currentPhase.phase,
      priority,
      phase: this.currentPhase.phase,
      effort,
      section: sectionNum
    });
  }

  private generateIssueBody(params: {
    phase: PhaseInfo;
    sectionNum: string;
    title: string;
    priority: string;
    effort: string;
    impact: string;
    tasks: string[];
  }): string {
    const { phase, sectionNum, title, priority, effort, impact, tasks } = params;

    let body = `## ${title}\n\n`;

    body += `**Phase:** ${phase.phase} - ${phase.title}\n`;
    body += `**Timeline:** ${phase.timeline}\n`;
    body += `**Section:** ${sectionNum}\n\n`;

    body += `### Goal\n${phase.goal}\n\n`;

    if (impact) {
      body += `### Impact\n${impact}\n\n`;
    }

    if (effort) {
      body += `### Effort Estimate\n${effort}\n\n`;
    }

    body += `### Priority\n${priority}\n\n`;

    if (tasks.length > 0) {
      body += `### Tasks\n\n`;
      for (const task of tasks) {
        body += `- [ ] ${task}\n`;
      }
      body += `\n`;
    }

    body += `### Acceptance Criteria\n\n`;
    body += `- [ ] All tasks completed\n`;
    body += `- [ ] Code reviewed and approved\n`;
    body += `- [ ] Tests passing (unit + integration)\n`;
    body += `- [ ] Documentation updated\n`;
    body += `- [ ] No regressions in existing functionality\n\n`;

    body += `### Related Documentation\n`;
    body += `- [Roadmap 2025](../docs/roadmap-2025.md)\n`;
    body += `- [Architecture](../docs/architecture.md)\n`;
    body += `- [Backlog](../docs/backlog.md)\n\n`;

    body += `---\n`;
    body += `*Generated from roadmap-2025.md*\n`;

    return body;
  }

  private determineLabels(title: string, priority: string, phase: string): string[] {
    const labels: string[] = [];

    // Add phase label
    const phaseNum = phase.match(/\d+/)?.[0];
    if (phaseNum) {
      labels.push(`phase:${phaseNum}`);
    }

    // Add priority label
    const priorityMap: Record<string, string> = {
      'P0': 'priority:critical',
      'P1': 'priority:high',
      'P2': 'priority:medium',
      'P3': 'priority:low'
    };
    labels.push(priorityMap[priority] || 'priority:medium');

    // Add type labels based on title/content
    const titleLower = title.toLowerCase();

    if (titleLower.includes('test') || titleLower.includes('testing')) {
      labels.push('testing');
    }
    if (titleLower.includes('document') || titleLower.includes('doc')) {
      labels.push('documentation');
    }
    if (titleLower.includes('performance') || titleLower.includes('optimiz')) {
      labels.push('performance');
    }
    if (titleLower.includes('security')) {
      labels.push('security');
    }
    if (titleLower.includes('refactor') || titleLower.includes('cleanup')) {
      labels.push('refactor');
    }
    if (titleLower.includes('bug') || titleLower.includes('fix')) {
      labels.push('bug');
    }

    // Default to enhancement if no type label
    if (!labels.some(l => ['testing', 'documentation', 'performance', 'security', 'refactor', 'bug'].includes(l))) {
      labels.push('enhancement');
    }

    // Add size label based on effort
    labels.push('status:ready');

    return labels;
  }
}

// ============================================================================
// Issue Generator
// ============================================================================

class IssueGenerator {
  private issues: Issue[];
  private outputDir: string;
  private dryRun: boolean;
  private phaseFilter: string[];

  constructor(issues: Issue[], options: {
    outputDir?: string;
    dryRun?: boolean;
    phases?: string[];
  } = {}) {
    this.issues = issues;
    this.outputDir = options.outputDir || OUTPUT_DIR;
    this.dryRun = options.dryRun || false;
    this.phaseFilter = options.phases || [];
  }

  async generate(): Promise<void> {
    // Filter issues by phase if specified
    let issuesToGenerate = this.issues;
    if (this.phaseFilter.length > 0) {
      issuesToGenerate = this.issues.filter(issue => {
        const phaseNum = issue.phase.match(/\d+/)?.[0];
        return phaseNum && this.phaseFilter.includes(phaseNum);
      });
    }

    console.log(`\n🚀 Generating ${issuesToGenerate.length} GitHub issues...\n`);

    // Create output directory
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Generate issue files
    const issueFiles: string[] = [];
    for (let i = 0; i < issuesToGenerate.length; i++) {
      const issue = issuesToGenerate[i];
      const filename = this.generateFilename(issue, i + 1);
      const filepath = path.join(this.outputDir, filename);

      // Write issue file
      const content = this.generateIssueFile(issue);
      fs.writeFileSync(filepath, content);

      issueFiles.push(filename);

      console.log(`✅ ${issue.priority} | ${issue.phase} | ${issue.title}`);
    }

    console.log(`\n📁 Generated ${issueFiles.length} issue files in ${this.outputDir}\n`);

    // Generate summary file
    this.generateSummary(issuesToGenerate);

    // Generate CLI script
    this.generateCLIScript(issuesToGenerate);

    if (this.dryRun) {
      console.log('🏃 DRY RUN - No issues created on GitHub\n');
      console.log('To create issues, run:');
      console.log('  bash .github/issues/create-all-issues.sh\n');
    }
  }

  private generateFilename(issue: Issue, index: number): string {
    const phaseNum = issue.phase.match(/\d+/)?.[0] || 'X';
    const priority = issue.priority;
    const slug = issue.title
      .replace(/\[.*?\]\s*/, '') // Remove phase prefix
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    return `${String(index).padStart(3, '0')}-${phaseNum}-${priority}-${slug}.md`;
  }

  private generateIssueFile(issue: Issue): string {
    let content = '---\n';
    content += `title: "${issue.title.replace(/"/g, '\\"')}"\n`;
    content += `labels:\n`;
    for (const label of issue.labels) {
      content += `  - ${label}\n`;
    }
    if (issue.milestone) {
      content += `milestone: ${issue.milestone}\n`;
    }
    content += '---\n\n';
    content += issue.body;

    return content;
  }

  private generateSummary(issues: Issue[]): void {
    const summaryPath = path.join(this.outputDir, 'SUMMARY.md');

    let content = '# Roadmap Issues Summary\n\n';
    content += `**Generated:** ${new Date().toISOString()}\n`;
    content += `**Total Issues:** ${issues.length}\n\n`;

    // Group by phase
    const byPhase: Record<string, Issue[]> = {};
    for (const issue of issues) {
      if (!byPhase[issue.phase]) {
        byPhase[issue.phase] = [];
      }
      byPhase[issue.phase].push(issue);
    }

    // Summary by phase
    content += '## Issues by Phase\n\n';
    for (const [phase, phaseIssues] of Object.entries(byPhase).sort()) {
      content += `### ${phase} (${phaseIssues.length} issues)\n\n`;

      // Group by priority
      const byPriority: Record<string, Issue[]> = {};
      for (const issue of phaseIssues) {
        if (!byPriority[issue.priority]) {
          byPriority[issue.priority] = [];
        }
        byPriority[issue.priority].push(issue);
      }

      for (const priority of ['P0', 'P1', 'P2', 'P3']) {
        const priorityIssues = byPriority[priority] || [];
        if (priorityIssues.length === 0) continue;

        content += `#### ${priority} (${priorityIssues.length})\n`;
        for (const issue of priorityIssues) {
          content += `- ${issue.title} (${issue.effort})\n`;
        }
        content += '\n';
      }
    }

    // Statistics
    content += '## Statistics\n\n';

    const priorityCounts: Record<string, number> = {};
    for (const issue of issues) {
      priorityCounts[issue.priority] = (priorityCounts[issue.priority] || 0) + 1;
    }

    content += '### By Priority\n';
    for (const [priority, count] of Object.entries(priorityCounts).sort()) {
      content += `- ${priority}: ${count}\n`;
    }
    content += '\n';

    content += '### By Phase\n';
    for (const [phase, phaseIssues] of Object.entries(byPhase).sort()) {
      content += `- ${phase}: ${phaseIssues.length}\n`;
    }

    fs.writeFileSync(summaryPath, content);
    console.log(`📊 Summary written to ${summaryPath}\n`);
  }

  private generateCLIScript(issues: Issue[]): void {
    const scriptPath = path.join(this.outputDir, 'create-all-issues.sh');

    let script = '#!/bin/bash\n\n';
    script += '# GitHub Issues Creation Script\n';
    script += '# Generated from roadmap-2025.md\n\n';
    script += 'set -e\n\n';

    script += 'echo "🚀 Creating GitHub issues from roadmap..."\n';
    script += 'echo ""\n\n';

    script += '# Check if gh CLI is installed\n';
    script += 'if ! command -v gh &> /dev/null; then\n';
    script += '  echo "❌ GitHub CLI (gh) is not installed"\n';
    script += '  echo "Install it from: https://cli.github.com/"\n';
    script += '  exit 1\n';
    script += 'fi\n\n';

    script += '# Check if authenticated\n';
    script += 'if ! gh auth status &> /dev/null; then\n';
    script += '  echo "❌ Not authenticated with GitHub"\n';
    script += '  echo "Run: gh auth login"\n';
    script += '  exit 1\n';
    script += 'fi\n\n';

    script += 'ISSUE_DIR="$(dirname "$0")"\n';
    script += 'CREATED=0\n';
    script += 'FAILED=0\n\n';

    // Group issues by phase for organized creation
    const byPhase: Record<string, Issue[]> = {};
    for (const issue of issues) {
      if (!byPhase[issue.phase]) {
        byPhase[issue.phase] = [];
      }
      byPhase[issue.phase].push(issue);
    }

    for (const [phase, phaseIssues] of Object.entries(byPhase).sort()) {
      script += `echo "📌 Creating ${phase} issues..."\n`;

      for (let i = 0; i < phaseIssues.length; i++) {
        const issue = phaseIssues[i];
        const filename = this.generateFilename(issue, issues.indexOf(issue) + 1);

        script += `\necho "  - ${issue.title.substring(0, 60)}..."\n`;
        script += `if gh issue create \\\n`;
        script += `  --title "${issue.title.replace(/"/g, '\\"')}" \\\n`;
        script += `  --body-file "$ISSUE_DIR/${filename}" \\\n`;

        for (const label of issue.labels) {
          script += `  --label "${label}" \\\n`;
        }

        if (issue.milestone) {
          script += `  --milestone "${issue.milestone}" \\\n`;
        }

        script += `  > /dev/null 2>&1; then\n`;
        script += `  ((CREATED++))\n`;
        script += `else\n`;
        script += `  ((FAILED++))\n`;
        script += `  echo "    ❌ Failed to create issue"\n`;
        script += `fi\n`;
      }

      script += `echo ""\n\n`;
    }

    script += 'echo "✅ Created $CREATED issues"\n';
    script += 'if [ $FAILED -gt 0 ]; then\n';
    script += '  echo "❌ Failed to create $FAILED issues"\n';
    script += '  exit 1\n';
    script += 'fi\n\n';

    script += 'echo ""\n';
    script += 'echo "🎉 All issues created successfully!"\n';
    script += 'echo "View them at: $(gh repo view --json url -q .url)/issues"\n';

    fs.writeFileSync(scriptPath, script);
    fs.chmodSync(scriptPath, 0o755);

    console.log(`📝 CLI script written to ${scriptPath}\n`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const dryRun = args.includes('--dry-run');
  const phaseArg = args.find(a => a.startsWith('--phase='));
  const phases = phaseArg ? phaseArg.split('=')[1].split(',') : [];
  const outputDirArg = args.find(a => a.startsWith('--output-dir='));
  const outputDir = outputDirArg ? outputDirArg.split('=')[1] : OUTPUT_DIR;

  console.log('\n📋 AIDJ Roadmap Issues Generator\n');
  console.log('================================\n');

  // Parse roadmap
  console.log('📖 Parsing roadmap from', ROADMAP_FILE);
  const parser = new RoadmapParser(ROADMAP_FILE);
  const issues = parser.parse();
  console.log(`✅ Parsed ${issues.length} issues from roadmap\n`);

  // Generate issues
  const generator = new IssueGenerator(issues, {
    outputDir,
    dryRun,
    phases
  });

  await generator.generate();

  console.log('✨ Done!\n');
}

// Run
main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
