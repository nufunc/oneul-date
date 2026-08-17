import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const chromePaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

const browserExe = chromePaths.find((p) => fs.existsSync(p));
if (!browserExe) {
  console.error('No Chrome/Edge browser found!');
  process.exit(1);
}

const htmlPath = path.resolve('scripts/og_template.html');
const outputPath = path.resolve('public/og.png');

console.log(`Using browser: ${browserExe}`);
console.log(`Input HTML: ${htmlPath}`);
console.log(`Output PNG: ${outputPath}`);

const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;

const cmd = `"${browserExe}" --headless --disable-gpu --hide-scrollbars --window-size=1200,630 --screenshot="${outputPath}" "${fileUrl}"`;
console.log(`Running: ${cmd}`);

try {
  execSync(cmd, { stdio: 'inherit' });
  console.log('Successfully generated public/og.png!');
  const stats = fs.statSync(outputPath);
  console.log(`File size: ${stats.size} bytes`);
} catch (err) {
  console.error('Failed to capture screenshot:', err);
  process.exit(1);
}
