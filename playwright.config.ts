import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["apps/web/e2e/**/*.spec.ts", "tests/e2e/**/*.spec.ts"],
  webServer: {
    command: "VITE_E2E_MODE=true pnpm --filter @cwl/web exec vite --host 127.0.0.1 --port 4173 --base /",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
  use: { baseURL: "http://127.0.0.1:4173" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
