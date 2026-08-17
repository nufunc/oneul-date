import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// GitHub Pages 프로젝트 페이지 경로: https://nufunc.github.io/oneul-date/
export default defineConfig({
  base: '/oneul-date/',
  define: {
    __APP_VERSION__: JSON.stringify(`v${pkg.version}`),
  },
});
