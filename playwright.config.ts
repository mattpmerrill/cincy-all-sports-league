import { defineConfig, devices } from "@playwright/test";

// Smoke suite in ./e2e. Point it at any deployment with E2E_BASE_URL; without it, it builds and
// serves the app locally (which needs the Supabase env vars set).
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm build && pnpm start",
        url: "http://localhost:3000",
        reuseExistingServer: true,
      },
});
