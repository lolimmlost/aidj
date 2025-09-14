import { beforeAll, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Run tests using JSDOM
beforeAll(() => {
  vi.mock('react-dom')
})

// Cleanup after each test
afterEach(() => {
  cleanup()
})

expect.extend(matchers)