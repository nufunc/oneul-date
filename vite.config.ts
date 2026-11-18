import { defineConfig } from 'vite';
import { existsSync, readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
// 권역 파일 색인(collector/sync_live_spots.py가 쓴다)을 번들에 넣어 첫 방문이 색인을 따로 받지 않게 한다(P-505).
// bytes는 완성 버튼 받은 비율의 분모다. 응답 스트림은 풀린 바이트를 내주므로 gzip 크기가 아니라 파일 크기다(P-257)
const spotsIndexUrl = new URL('./public/data/spots/index.json', import.meta.url);
const spotsIndex = existsSync(spotsIndexUrl) ? JSON.parse(readFileSync(spotsIndexUrl, 'utf-8')).files : {};

// 기본은 GitHub Pages 프로젝트 페이지 경로(https://nufunc.github.io/oneul-date/)다.
// 다른 호스팅은 BASE_PATH로 바꾸고, 정적 파일의 주소는 빌드 끝의 scripts/rebase_dist.mjs가 같은 값으로 바꾼다(P-485)
export default defineConfig({
  base: process.env.BASE_PATH || '/oneul-date/',
  define: {
    __APP_VERSION__: JSON.stringify(`v${pkg.version}`),
    __SPOTS_INDEX__: JSON.stringify(spotsIndex),
  },
});
