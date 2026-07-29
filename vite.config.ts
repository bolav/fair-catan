import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // tests/ belongs to Playwright, which has its own runner.
    include: ['src/**/*.test.ts'],
  },
  server: {
    // Bind on all interfaces so the dev server is reachable from outside the
    // sandbox container (published on port 5173).
    host: true,
    port: 5173,
  },
})
