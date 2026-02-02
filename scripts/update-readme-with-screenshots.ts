/**
 * Update README with Screenshots
 *
 * Generates an enhanced README.md with screenshots, badges, and modern layout.
 * Run after: npx tsx scripts/capture-readme-screenshots.ts
 *
 * Usage: npx tsx scripts/update-readme-with-screenshots.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const README_PATH = path.join(process.cwd(), 'README.md');
const SCREENSHOT_DIR = path.join(process.cwd(), 'docs', 'screenshots');

interface ScreenshotInfo {
  name: string;
  path: string;
  exists: boolean;
}

function getAvailableScreenshots(): ScreenshotInfo[] {
  const expectedScreenshots = [
    'dashboard',
    'dashboard-analytics',
    'dashboard-discover',
    'library-artists',
    'library-search',
    'playlists',
    'dj-set-builder',
    'dj-settings',
    'music-identity',
    'settings',
    'settings-playback',
    'downloads-youtube',
    'mobile-dashboard',
    'mobile-library',
    'mobile-player',
    'login',
  ];

  return expectedScreenshots.map((name) => {
    const filename = `${name}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);
    return {
      name,
      path: `docs/screenshots/${filename}`,
      exists: fs.existsSync(filepath),
    };
  });
}

function generateReadme(screenshots: ScreenshotInfo[]): string {
  const hasScreenshots = screenshots.some((s) => s.exists);
  const heroScreenshot = screenshots.find((s) => s.name === 'dashboard' && s.exists);
  const libraryScreenshot = screenshots.find((s) => s.name === 'library-artists' && s.exists);
  const djScreenshot = screenshots.find((s) => s.name === 'dj-set-builder' && s.exists);
  const identityScreenshot = screenshots.find((s) => s.name === 'music-identity' && s.exists);
  const mobileScreenshots = screenshots.filter((s) => s.name.startsWith('mobile-') && s.exists);

  return `<!-- PROJECT LOGO -->
<div align="center">
  <h1>AIDJ</h1>
  <p><strong>AI-Assisted Music Library & Smart DJ</strong></p>
  <p>
    A modern web application for managing your self-hosted music library with AI-powered recommendations,
    smart playlists, and seamless crossfade playback.
  </p>

  <!-- BADGES -->
  <p>
    <a href="https://github.com/lolimmlost/aidj/actions"><img src="https://github.com/lolimmlost/aidj/actions/workflows/ci.yml/badge.svg" alt="CI Status"></a>
    <a href="https://codecov.io/gh/lolimmlost/aidj"><img src="https://codecov.io/gh/lolimmlost/aidj/branch/main/graph/badge.svg" alt="Coverage"></a>
    <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React 19">
    <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript" alt="TypeScript">
    <img src="https://img.shields.io/badge/License-Unlicense-blue" alt="License">
  </p>

  ${heroScreenshot ? `<img src="${heroScreenshot.path}" alt="AIDJ Dashboard" width="800">` : ''}
</div>

---

## Features

| Feature | Description |
|---------|-------------|
| **Smart Music Library** | Browse artists, albums, and tracks with infinite scroll and search |
| **AI DJ Mode** | Automatic queue management with intelligent song recommendations |
| **Crossfade Playback** | Smooth transitions between tracks with dual-deck audio engine |
| **Music Identity** | Spotify Wrapped-style insights into your listening habits |
| **Smart Playlists** | Create rule-based playlists that auto-update |
| **DJ Set Builder** | Build and save DJ sets with BPM/key matching |
| **YouTube Downloads** | Download and import music from YouTube |
| **Dark Mode** | Beautiful dark theme with system preference detection |
| **Mobile Responsive** | Full-featured mobile experience with touch controls |
| **Self-Hosted** | All data stays on your local network |

${
  libraryScreenshot
    ? `
### Library View
<img src="${libraryScreenshot.path}" alt="Music Library" width="700">
`
    : ''
}

${
  djScreenshot
    ? `
### DJ Set Builder
<img src="${djScreenshot.path}" alt="DJ Set Builder" width="700">
`
    : ''
}

${
  identityScreenshot
    ? `
### Music Identity
<img src="${identityScreenshot.path}" alt="Music Identity" width="700">
`
    : ''
}

${
  mobileScreenshots.length > 0
    ? `
### Mobile Experience
<p>
  ${mobileScreenshots.map((s) => `<img src="${s.path}" alt="${s.name}" width="200">`).join(' ')}
</p>
`
    : ''
}

---

## Tech Stack

<table>
  <tr>
    <td align="center"><strong>Frontend</strong></td>
    <td align="center"><strong>Backend</strong></td>
    <td align="center"><strong>Infrastructure</strong></td>
  </tr>
  <tr>
    <td>
      <a href="https://react.dev">React 19</a> + React Compiler<br>
      <a href="https://tanstack.com/start">TanStack Start</a><br>
      <a href="https://tailwindcss.com">Tailwind CSS v4</a><br>
      <a href="https://ui.shadcn.com">shadcn/ui</a>
    </td>
    <td>
      <a href="https://orm.drizzle.team">Drizzle ORM</a><br>
      PostgreSQL<br>
      <a href="https://better-auth.com">Better Auth</a><br>
      <a href="https://tanstack.com/query">TanStack Query</a>
    </td>
    <td>
      <a href="https://www.navidrome.org">Navidrome</a> (music server)<br>
      <a href="https://www.last.fm/api">Last.fm API</a> (recommendations)<br>
      Vite + Node.js
    </td>
  </tr>
</table>

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database
- [Navidrome](https://www.navidrome.org/) music server
- (Optional) Last.fm API key for recommendations

### Installation

1. **Clone the repository**
   \`\`\`bash
   git clone https://github.com/lolimmlost/aidj.git
   cd aidj
   \`\`\`

2. **Install dependencies**
   \`\`\`bash
   npm install
   \`\`\`

3. **Configure environment**
   \`\`\`bash
   cp .env.example .env
   \`\`\`

   Edit \`.env\` with your configuration. See [environment-configuration.md](./docs/environment-configuration.md) for details.

4. **Initialize database**
   \`\`\`bash
   npm run db:push
   \`\`\`

5. **Start development server**
   \`\`\`bash
   npm run dev
   \`\`\`

   Open [http://localhost:3000](http://localhost:3000)

---

## Project Structure

\`\`\`
src/
├── components/           # UI components (shadcn/ui)
│   ├── layout/           # PlayerBar, Sidebar, etc.
│   └── ui/               # Reusable UI primitives
├── lib/
│   ├── auth/             # Better Auth setup
│   ├── db/               # Drizzle ORM schema
│   ├── services/         # External integrations
│   │   ├── navidrome.ts  # Navidrome/Subsonic API
│   │   ├── lastfm/       # Last.fm recommendations
│   │   └── ai-dj/        # AI DJ engine
│   └── stores/           # Zustand state management
├── routes/
│   ├── dashboard/        # Main dashboard views
│   ├── library/          # Music library (artists/albums)
│   ├── dj/               # DJ features
│   ├── playlists/        # Playlist management
│   └── settings/         # App configuration
└── styles.css            # Global Tailwind styles
\`\`\`

---

## Configuration

### Required Services

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **Navidrome** | Music streaming & library | URL, username, password |
| **PostgreSQL** | App database | Connection string |

### Optional Services

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **Last.fm** | Music recommendations | API key |
| **MusicBrainz** | Extended metadata | (No auth required) |

Configure services in the Settings page or via environment variables.

---

## Development

### Commands

| Command | Description |
|---------|-------------|
| \`npm run dev\` | Start development server |
| \`npm run build\` | Build for production |
| \`npm run test\` | Run unit tests |
| \`npm run test:e2e\` | Run Playwright E2E tests |
| \`npm run lint\` | Lint codebase |
| \`npm run db:push\` | Push schema to database |
| \`npm run db:studio\` | Open Drizzle Studio |

### Testing

\`\`\`bash
# Unit tests with Vitest
npm run test
npm run test:coverage

# E2E tests with Playwright
npm run test:e2e
npm run test:e2e:ui
\`\`\`

### CI/CD

The project includes GitHub Actions workflows for:
- Linting & type checking
- Unit tests with coverage (>80% required)
- Security scanning (Trivy, Gitleaks)
- Automated builds

---

## Roadmap

- [x] Music library integration (Navidrome)
- [x] Audio player with crossfade
- [x] AI DJ mode with smart recommendations
- [x] Music Identity (listening insights)
- [x] Smart playlists
- [x] DJ Set Builder
- [x] YouTube downloads
- [ ] Ollama integration for local AI
- [ ] Multi-user support
- [ ] Offline mode (PWA)

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (\`git checkout -b feature/amazing-feature\`)
3. Commit changes (\`git commit -m 'Add amazing feature'\`)
4. Push to branch (\`git push origin feature/amazing-feature\`)
5. Open a Pull Request

---

## License

This project is released into the public domain via the [Unlicense](./LICENSE).

---

<div align="center">
  <p>
    <a href="https://github.com/lolimmlost/aidj/issues">Report Bug</a>
    ·
    <a href="https://github.com/lolimmlost/aidj/issues">Request Feature</a>
  </p>
</div>
`;
}

function main() {
  console.log('📝 Updating README with screenshots...\n');

  const screenshots = getAvailableScreenshots();
  const available = screenshots.filter((s) => s.exists);
  const missing = screenshots.filter((s) => !s.exists);

  console.log(`Found ${available.length} screenshots:`);
  available.forEach((s) => console.log(`  ✅ ${s.name}`));

  if (missing.length > 0) {
    console.log(`\nMissing ${missing.length} screenshots:`);
    missing.forEach((s) => console.log(`  ⚠️ ${s.name}`));
    console.log('\nRun: npx tsx scripts/capture-readme-screenshots.ts');
  }

  // Generate README
  const readme = generateReadme(screenshots);

  // Backup existing README
  if (fs.existsSync(README_PATH)) {
    const backup = README_PATH + '.backup';
    fs.copyFileSync(README_PATH, backup);
    console.log(`\n📋 Backed up existing README to ${backup}`);
  }

  // Write new README
  fs.writeFileSync(README_PATH, readme);
  console.log(`✅ Updated README.md`);

  console.log('\n📋 Next steps:');
  console.log('   1. Review the updated README.md');
  console.log('   2. Adjust any screenshot paths if needed');
  console.log('   3. git add . && git commit -m "Update README with screenshots"');
}

main();
