import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // One browser, one machine: this suite exists to catch layout regressions in
  // this container, not to prove cross-browser rendering.
  fullyParallel: true,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['Desktop Chrome'],
  },
  expect: {
    // Text antialiasing moves a handful of pixels between runs.
    toHaveScreenshot: { maxDiffPixelRatio: 0.002 },
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
