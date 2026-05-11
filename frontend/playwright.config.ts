import { defineConfig, devices } from "@playwright/test";

/**
 * Headless Chromium smoke tests for the KATO UNITRACK editor.
 *
 *   npm run e2e
 *
 * One-time setup (does NOT run on `npm install`):
 *   npx playwright install chromium
 *
 * macOS users: do NOT pass `--with-deps`. That flag is Linux-only and
 * triggers a sudo prompt on macOS. See README "Browser tests".
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // one chromium project, sequential is faster here
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  expect: { timeout: 6_000 },
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    viewport: { width: 1400, height: 900 },
    actionTimeout: 6_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    // Dev box: reuse to skip the 1-2s vite warmup between runs.
    // CI: always start a clean process so a flaky test cannot mask
    //     a build error in a previous run.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
