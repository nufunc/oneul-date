import { defineConfig } from 'vite';
import { existsSync, readFileSync, statSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
// 완성 버튼 받은 비율의 분모. 응답 스트림은 풀린 바이트를 내주므로 gzip 크기(Content-Length)가 아니라 파일 크기를 넣는다(P-257)
const spotsJson = new URL('./public/data/spots.json', import.meta.url);
const spotsJsonBytes = existsSync(spotsJson) ? statSync(spotsJson).size : 0;

// GitHub Pages 프로젝트 페이지 경로: https://nufunc.github.io/oneul-date/
export default defineConfig({
  base: '/oneul-date/',
  define: {
    __APP_VERSION__: JSON.stringify(`v${pkg.version}`),
    __SPOTS_JSON_BYTES__: JSON.stringify(spotsJsonBytes),
  },
});
