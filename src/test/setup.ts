import { beforeAll, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Mock ResizeObserver for Radix UI components
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Run tests using JSDOM
beforeAll(() => {
  vi.mock('react-dom')
})

// Cleanup after each test
afterEach(() => {
  cleanup()
})

expect.extend(matchers)