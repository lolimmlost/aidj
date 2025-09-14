# Testing Framework Integration

This document provides comprehensive setup instructions, best practices, and configuration details for the testing framework used in the AIDJ Music Interface project.

## Overview

The project uses a multi-layered testing strategy:

1. **Unit Tests**: Vitest for testing individual functions, components, and utilities
2. **Integration Tests**: Testing service layers and API interactions
3. **Component Tests**: React Testing Library for UI component behavior
4. **E2E Tests**: Playwright for end-to-end user journey validation
5. **Visual Regression**: Playwright for UI consistency across browsers

## Prerequisites

### Node.js Dependencies

Install the required testing dependencies:

```bash
# Core testing framework
pnpm add -D vitest @vitest/ui @vitest/coverage-istanbul @testing-library/react @testing-library/jest-dom jsdom

# E2E testing
pnpm add -D @playwright/test

# Type definitions
pnpm add -D @types/node @types/react @types/react-dom

# Linting and formatting for tests
pnpm add -D eslint-plugin-testing-library
```

### Playwright Browser Installation

Install Playwright browsers:

```bash
npx playwright install
npx playwright install-deps  # For Linux systems
```

## Configuration

### Vitest Configuration

The `vitest.config.ts` is configured for:

- **ESM Support**: Full ES module compatibility
- **React Testing**: JSX transformation with React 19
- **Coverage**: Istanbul coverage collection
- **Environment**: JSDOM for browser-like testing
- **Watch Mode**: Fast test reruns during development

Key configuration highlights:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '.vscode/',
        'tests/e2e/',
        '**/*.config.*',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
```

### Playwright Configuration

Playwright is configured in `playwright.config.ts` for:

- **Multi-browser Testing**: Chrome, Firefox, Safari, and mobile browsers
- **Parallel Execution**: Tests run in parallel for faster execution
- **Automatic Server Start**: Starts the dev server before tests
- **Trace Recording**: Captures traces on failures for debugging
- **Reporting**: HTML reports, JSON output, and GitHub integration
- **Retries**: Automatic retries in CI environments

Configuration details:

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results.json' }],
    process.env.CI ? ['github'] : [],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Running Tests

### Unit and Component Tests (Vitest)

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run with UI
pnpm test:ui

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm test src/lib/auth/__tests__/auth.test.ts

# Run tests with specific pattern
pnpm test -- test auth
```

### E2E Tests (Playwright)

```bash
# Install browsers (run once)
npx playwright install

# Run all E2E tests
pnpm test:e2e

# Run in headed mode (visible browser)
pnpm test:e2e:headed

# Run with UI mode
pnpm test:e2e:ui

# Run specific test
npx playwright test tests/e2e/user-journey.spec.ts

# Debug a specific test
pnpm test:e2e:debug

# Generate test report
npx playwright show-report
```

### CI/CD Integration

The GitHub Actions workflow runs:

1. **Linting**: ESLint for code quality
2. **Type Checking**: TypeScript compilation
3. **Unit Tests**: Vitest with coverage reporting
4. **E2E Tests**: Playwright across multiple browsers (main branch only)
5. **Security Scanning**: Gitleaks and npm audit
6. **Coverage Upload**: Codecov integration

## Test Structure

### Unit Tests

- **Location**: `src/**/__tests__/*.test.ts`
- **Purpose**: Test individual functions and utilities
- **Examples**: Auth functions, API service calls, data transformations

**Example Structure**:
```
src/
  lib/
    auth/
      __tests__/
        auth.test.ts      # Auth client and server function tests
    services/
      __tests__/
        navidrome.test.ts  # API integration tests
```

### Component Tests

- **Location**: `src/**/__tests__/*.test.tsx`
- **Purpose**: Test React component rendering and interactions
- **Tools**: React Testing Library, TanStack Query mocking

**Example Structure**:
```
src/
  routes/
    library/
      __tests__/
        artists.test.tsx   # Artists list component
        search.test.tsx    # Search functionality
```

### E2E Tests

- **Location**: `tests/e2e/*.spec.ts`
- **Purpose**: Validate complete user journeys
- **Scenarios**: Authentication, configuration, library navigation, playback

**Key Test Files**:
- `user-journey.spec.ts`: Complete workflow validation
- `auth-flow.spec.ts`: Login/logout scenarios
- `library-navigation.spec.ts`: Browse and search functionality
- `playback.spec.ts`: Audio player controls

## Best Practices

### Unit Testing

1. **Mock External Dependencies**: Mock API calls, database queries, and third-party services
2. **Test Edge Cases**: Empty states, error conditions, invalid inputs
3. **Keep Tests Fast**: Avoid network calls or heavy computations
4. **Single Responsibility**: Each test should validate one specific behavior
5. **Use Descriptive Names**: `shouldHandleSuccessfulLogin` vs `testLogin`

### Component Testing

1. **Test Behavior, Not Implementation**: Focus on user interactions and outcomes
2. **Use User-Centric Selectors**: `getByRole`, `getByLabelText`, `getByText`
3. **Mock Data Fetching**: Use MSW or direct mocks for API responses
4. **Test Accessibility**: Verify ARIA labels and keyboard navigation
5. **Simulate Real Interactions**: Use `fireEvent` or `userEvent` for realistic user actions

### E2E Testing

1. **Test Critical Paths**: Focus on high-value user journeys
2. **Use Realistic Data**: Mock services with representative responses
3. **Handle Authentication**: Use test users or bypass auth for testing
4. **Test Error States**: Network failures, invalid configurations
5. **Cross-Browser Testing**: Validate consistency across browsers
6. **Performance Monitoring**: Track load times and interactions

## Mocking Strategy

### API Mocking (MSW)

For integration and component tests, use MSW to mock API responses:

```typescript
// src/test/msw/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/artist', () => {
    return HttpResponse.json([
      { id: '1', name: 'Test Artist' }
    ]);
  }),
  http.post('/auth/login', ({ request }) => {
    return HttpResponse.json({
      token: 'mock-token',
      user: { id: '1', email: 'test@example.com' }
    });
  }),
];
```

### Service Mocking

Mock service layer functions directly in unit tests:

```typescript
// src/lib/services/__tests__/navidrome.test.ts
vi.mock('@/lib/config/config', () => ({
  getConfig: vi.fn().mockReturnValue({
    navidromeUrl: 'http://localhost:4533',
    navidromeUsername: 'testuser',
    navidromePassword: 'testpass',
  }),
}));
```

## Coverage Requirements

The project enforces the following minimum coverage thresholds:

- **Lines**: 80%
- **Functions**: 80%
- **Branches**: 80%
- **Statements**: 80%

Coverage is tracked and reported through:

1. **Local Development**: `pnpm test:coverage`
2. **CI/CD Pipeline**: Automatic reporting in GitHub Actions
3. **Codecov Integration**: Coverage trends and PR comments
4. **Badges**: Coverage badges in README

## Troubleshooting

### Vitest Issues

**"Cannot find module" errors**:
```bash
# Clear cache and reinstall
rm -rf node_modules .vite
pnpm install
```

**JSX/TSX compilation errors**:
```bash
# Check tsconfig.json paths
pnpm check-types
```

### Playwright Issues

**Browser installation fails**:
```bash
# Force reinstall browsers
npx playwright install --force
```

**Tests timeout on CI**:
```bash
# Increase timeout in playwright.config.ts
use: {
  actionTimeout: 30000,
  navigationTimeout: 30000,
}
```

**Headless mode issues**:
```bash
# Install system dependencies (Ubuntu/Debian)
npx playwright install-deps
```

## Test Maintenance

### Adding New Tests

1. **Unit Tests**: Add to existing `__tests__` directories
2. **Component Tests**: Colocate with components in `__tests__`
3. **E2E Tests**: Add to `tests/e2e/` with descriptive `.spec.ts` names
4. **Update Coverage**: Ensure new code meets coverage thresholds

### Updating Tests

1. **Refactor Tests**: Update selectors and mocks when UI changes
2. **Mock Updates**: Adjust API mocks when backend changes
3. **Browser Compatibility**: Test across all configured browsers
4. **Performance**: Monitor test execution time and optimize

### Running Tests Locally

```bash
# Development workflow
pnpm test --watch          # Watch mode for unit tests
pnpm test:e2e:headed       # Headed E2E for debugging
pnpm test:coverage         # Generate coverage report

# Before PR
pnpm check                 # Lint, types, format
pnpm test                  # Unit tests
pnpm test:e2e              # E2E tests
```

## Integration with Development Workflow

### Pre-commit Hooks

The project uses Husky for pre-commit validation:

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{ts,tsx,json,md}": "prettier --check"
  }
}
```

### VS Code Integration

Recommended VS Code extensions:

- **Vitest**: Test runner integration
- **Playwright**: E2E test debugging
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Thunder Client**: API testing

## Future Enhancements

### Planned Improvements

1. **Visual Regression Testing**: Playwright component testing for UI consistency
2. **Performance Testing**: Lighthouse CI integration for performance monitoring
3. **Accessibility Testing**: Axe-core integration for a11y validation
4. **Load Testing**: Artillery or k6 for API performance testing
5. **Contract Testing**: Pact for API contract verification
6. **Mutation Testing**: Stryker for code reliability assessment

### Monitoring and Reporting

- **Test Analytics**: Track test flakiness and execution trends
- **Alerting**: Slack/Teams notifications for test failures
- **Dashboard**: Test results visualization in GitHub Projects

## Contribution Guidelines

### Writing Tests

1. **Always Add Tests**: New features must include comprehensive test coverage
2. **Follow Patterns**: Use existing test patterns and naming conventions
3. **Mock Consistently**: Use established mocking strategies
4. **Document Test Setup**: Add comments for complex test scenarios
5. **Keep Tests Fast**: Optimize test execution time

### Reviewing Tests

1. **Coverage Verification**: Ensure new code is properly tested
2. **Test Quality**: Validate test scenarios cover edge cases
3. **Performance Impact**: Check that tests don't slow down CI
4. **Maintainability**: Ensure tests are readable and maintainable

### When Tests Fail

1. **Local Reproduction**: Reproduce failures in local environment
2. **Flaky Tests**: Identify and fix intermittent failures
3. **Environment Issues**: Check for CI vs local environment differences
4. **Dependency Updates**: Verify compatibility with package updates

---

**Last Updated**: September 2025  
**Version**: 1.0  
**Maintainer**: Development Team