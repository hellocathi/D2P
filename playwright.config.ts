import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  timeout: 240000,
  workers: 1,
  use: {
    baseURL: "http://localhost:3001",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm start",
    url: "http://localhost:3001/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
