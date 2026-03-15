import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const localChromePathCandidates = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];
const localChromeExecutablePath = localChromePathCandidates.find((candidatePath: string): boolean =>
  fs.existsSync(candidatePath),
);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI === 'true' ? 1 : 0,
  timeout: 45_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    launchOptions:
      process.env.CI === 'true'
        ? {
            args: ['--use-angle=swiftshader'],
          }
        : {
            args: ['--use-angle=swiftshader'],
            ...(localChromeExecutablePath === undefined
              ? {}
              : { executablePath: localChromeExecutablePath }),
          },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: process.env.CI !== 'true',
    timeout: 30_000,
  },
});
