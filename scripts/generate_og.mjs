// 공유 미리보기 이미지(og-v2.png)를 scripts/og_template.html에서 만든다. 실행: node scripts/generate_og.mjs
// playwright-core와 Chromium 계열 브라우저가 필요하다. 환경변수 PLAYWRIGHT_CORE에 모듈 경로, OG_BROWSER에 실행 파일 경로를 줄 수 있다.
import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const htmlPath = path.resolve('scripts/og_template.html');
const outputPath = path.resolve('public/og-v2.png');

const browser = await chromium.launch(process.env.OG_BROWSER ? { executablePath: process.env.OG_BROWSER } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: outputPath, type: 'png' });
} finally {
  await browser.close();
}
console.log(`생성: ${outputPath} (${fs.statSync(outputPath).size} bytes)`);
