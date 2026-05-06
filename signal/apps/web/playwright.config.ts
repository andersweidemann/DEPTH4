import { defineConfig, devices } from "@playwright/test";

/** Dedicated port so Playwright does not collide with a developer server on :3000. */
const PW_PORT = 3100;

const webServerCommand = process.env.CI
  ? `npm run build && npx next start -p ${PW_PORT}`
  : `npx next dev -p ${PW_PORT}`;

const baseURL = `http://127.0.0.1:${PW_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    viewport: { width: 1280, height: 900 },
    trace: "on-first-retry",
  },
  timeout: 60_000,
  expect: { timeout: 15_000 },
  webServer: {
    command: webServerCommand,
    url: `${baseURL}/theses`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
