# Testing Framework Integration

This document outlines the recommended approach for integrating testing frameworks into the Music Recommendation and Download Interface application to fulfill the PRD requirements for unit and integration testing.

## Current Status

As identified in the PO Master Validation Report, the project currently lacks testing frameworks despite the PRD specifying "Unit + Integration testing" requirements.

## Recommended Testing Frameworks

### Unit Testing
- **Vitest**: A fast unit test framework powered by Vite, well-suited for our React + Vite stack
- **React Testing Library**: For testing React components in a user-centric way

### Integration Testing
- **Vitest**: Can also be used for integration testing with appropriate setup
- **Playwright**: For end-to-end testing of the application

## Implementation Plan

### 1. Add Dependencies to package.json

The following dependencies should be added to the project:

```json
{
  "devDependencies": {
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/user-event": "^14.5.0",
    "playwright": "^1.40.0",
    "@playwright/test": "^1.40.0"
  }
}
```

### 2. Configure Test Scripts

Add the following scripts to package.json:

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui"
  }
}
```

### 3. Create Test Configuration Files

#### Vitest Configuration (vitest.config.ts)
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

#### Playwright Configuration (playwright.config.ts)
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### 4. Test Directory Structure

```
tests/
├── unit/              # Unit tests
├── integration/       # Integration tests
├── e2e/               # End-to-end tests
└── setup.ts          # Test setup file
```

## Testing Strategy Alignment with PRD

### Unit Testing Coverage
- React components (UI components)
- Utility functions
- Service functions
- Helper functions

### Integration Testing Coverage
- API route handlers
- Database operations
- Service integrations (Ollama, Navidrome, Lidarr)
- Authentication flows

### End-to-End Testing Coverage
- Critical user journeys
- Authentication flows
- Main application features
- Cross-browser compatibility

## Quality Assurance Benefits

1. **Improved Code Quality**: Automated testing helps catch bugs early
2. **Regression Prevention**: Tests ensure new changes don't break existing functionality
3. **Documentation**: Tests serve as living documentation of expected behavior
4. **Confidence in Deployment**: Comprehensive test coverage increases confidence in releases

## Next Steps

1. Add the recommended dependencies to package.json
2. Create the configuration files
3. Set up the test directory structure
4. Write initial tests for critical components
5. Integrate testing into the CI/CD pipeline

This approach will address the testing infrastructure gap identified in the PO Master Validation Report and fulfill the PRD requirements for unit and integration testing.