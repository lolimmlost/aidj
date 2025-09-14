# CI/CD Workflows

This directory contains GitHub Actions workflows that automate the build, test, and security scanning processes for the Music Recommendation Interface project.

## Available Workflows

### main.yml - Main CI/CD Pipeline

This workflow runs on every push to `main` and every pull request targeting `main`. It consists of three main jobs:

#### 1. Build Job
- **Purpose**: Validates the codebase by running linting, building, and testing
- **Steps**:
  - Checks out the code
  - Sets up Node.js 20 with pnpm caching for faster installs
  - Installs dependencies using `pnpm install --frozen-lockfile`
  - Runs ESLint for code quality checks (`pnpm lint`)
  - Builds the project (`pnpm build`)
  - Runs unit tests with coverage (`pnpm test:coverage`)
  - Checks that test coverage meets 80% threshold
  - Uploads coverage reports to Codecov (if `CODECOV_TOKEN` secret is configured)

#### 2. Security Job
- **Purpose**: Scans the codebase for security vulnerabilities
- **Steps**:
  - Uses Trivy to scan the filesystem for vulnerabilities
  - Uploads results as SARIF files for GitHub's security tab
  - Runs regardless of previous job success/failure

#### 3. Secret Scan Job
- **Purpose**: Scans for accidentally committed secrets and tokens
- **Steps**:
  - Uses Gitleaks to detect common secrets in the codebase
  - Requires `GITHUB_TOKEN` (automatically available in GitHub Actions)

## Required Secrets

For full functionality, configure these repository secrets in GitHub Settings:

- `CODECOV_TOKEN`: Token for uploading coverage reports to Codecov
  - Get from [Codecov](https://codecov.io/gh/YOUR_USERNAME/YOUR_REPO/settings) after connecting your repository

## Viewing Results

- **Build/Test Results**: Available in the "Actions" tab of your repository
- **Coverage Reports**: View detailed coverage at [codecov.io](https://codecov.io/gh/YOUR_USERNAME/YOUR_REPO) (if configured)
- **Security Alerts**: View in the "Security" tab under "Code scanning alerts"
- **Secret Scanning**: Alerts appear in the "Security" tab if secrets are detected

## Coverage Requirements

The pipeline enforces >80% code coverage for line coverage. If coverage falls below this threshold, the build will fail. To improve coverage:

1. Run `pnpm test:coverage` locally to see current coverage
2. Add missing tests for uncovered code paths
3. Review the coverage report in `coverage/lcov-report/index.html`

## Troubleshooting

- **pnpm cache issues**: The workflow uses `--frozen-lockfile` to ensure reproducible builds. Update dependencies with `pnpm install` locally first.
- **Test failures**: Run `pnpm test` locally to debug failing tests.
- **Coverage threshold**: Adjust the threshold in `.github/workflows/main.yml` if needed for your project stage.
- **Security scan false positives**: Review and dismiss false positives in GitHub's security tab.

## Local Development

To replicate the CI environment locally:

```bash
# Install dependencies
pnpm install

# Run linting
pnpm lint

# Run tests with coverage
pnpm test:coverage

# Build the project
pnpm build

# Check type safety
pnpm check-types
```

For more details on the testing setup, see [docs/testing-framework-integration.md](docs/testing-framework-integration.md).