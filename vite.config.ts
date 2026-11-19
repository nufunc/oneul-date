import { defineConfig, type Plugin } from 'vite';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
// 권역 파일 색인(collector/sync_live_spots.py가 쓴다)을 번들에 넣어 첫 방문이 색인을 따로 받지 않게 한다(P-505).
// bytes는 완성 버튼 받은 비율의 분모다. 응답 스트림은 풀린 바이트를 내주므로 gzip 크기가 아니라 파일 크기다(P-257)
const spotsIndexUrl = new URL('./public/data/spots/index.json', import.meta.url);
const spotsIndex = existsSync(spotsIndexUrl) ? JSON.parse(readFileSync(spotsIndexUrl, 'utf-8')).files : {};

// 조각 하나의 목표 크기. 받은 링크 한 곳이 조각 하나를 받는다
const SHARD_BYTES = 1_000_000;

/**
 * public/data/spots.json(id 오름차순 행 배열)을 id 구간 조각 data/spots/by-id/<첫 id>.json으로 나눠 빌드에 넣고,
 * 조각 첫 id 목록을 __SPOTS_SHARDS__로 번들에 넣는다. 단일 spots.json은 Cloudflare Pages 파일당 25MiB 한도에 닿아
 * 산출물에서 지운다(P-513). 개발 서버는 조각이 없어 목록이 비고, 받은 링크는 권역 파일을 기다린다
 */
function spotShards(): Plugin {
  const src = new URL('./public/data/spots.json', import.meta.url);
  const shards: { first: number; rows: unknown[] }[] = [];
  let outDir = 'dist';
  return {
    name: 'spot-shards',
    apply: 'build',
    config() {
      if (!existsSync(src)) return { define: { __SPOTS_SHARDS__: '[]' } };
      const rows = JSON.parse(readFileSync(src, 'utf-8')) as { id: number }[];
      let size = 0;
      let prev = -Infinity;
      for (const row of rows) {
        if (!(row.id > prev)) throw new Error(`spots.json이 id 오름차순이 아니다: ${prev} 뒤 ${row.id}`);
        prev = row.id;
        const bytes = Buffer.byteLength(JSON.stringify(row)) + 1;
        if (shards.length === 0 || size + bytes > SHARD_BYTES) {
          shards.push({ first: row.id, rows: [] });
          size = 2;
        }
        shards.at(-1)!.rows.push(row);
        size += bytes;
      }
      return { define: { __SPOTS_SHARDS__: JSON.stringify(shards.map((s) => s.first)) } };
    },
    configResolved(c) {
      outDir = c.build.outDir;
    },
    generateBundle() {
      for (const s of shards) this.emitFile({ type: 'asset', fileName: `data/spots/by-id/${s.first}.json`, source: JSON.stringify(s.rows) });
    },
    closeBundle() {
      rmSync(join(outDir, 'data', 'spots.json'), { force: true });
    },
  };
}

// 기본은 GitHub Pages 프로젝트 페이지 경로(https://nufunc.github.io/oneul-date/)다.
// 다른 호스팅은 BASE_PATH로 바꾸고, 정적 파일의 주소는 빌드 끝의 scripts/rebase_dist.mjs가 같은 값으로 바꾼다(P-485)
export default defineConfig({
  base: process.env.BASE_PATH || '/oneul-date/',
  define: {
    __APP_VERSION__: JSON.stringify(`v${pkg.version}`),
    __SPOTS_INDEX__: JSON.stringify(spotsIndex),
  },
  plugins: [spotShards()],
});
