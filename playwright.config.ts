import { defineConfig, devices } from '@playwright/test';

// 사용자 흐름 e2e(P-508). E2E_URL이 있으면 그 주소(라이브)를, 없으면 vite preview로 띄운 dist를 시험한다.
// 포트는 다른 세션의 dev 서버(5173)와 겹치지 않게 E2E_PORT(기본 4319)로 둔다
const port = Number(process.env.E2E_PORT || 4319);
const baseURL = process.env.E2E_URL || `http://localhost:${port}/oneul-date/`;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    // sw.js가 데이터 요청을 가로채면 page.route가 그 요청을 보지 못한다. 매 시험이 캐시 없는 첫 방문이기도 하다
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: process.env.E2E_URL
    ? undefined
    : { command: `npx vite preview --port ${port} --strictPort`, url: baseURL, reuseExistingServer: false },
});
