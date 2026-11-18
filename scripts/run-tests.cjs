// scripts/test-*.cjs를 차례로 돌리고 하나라도 실패하면 1로 끝난다.
// scripts/tests-live.txt에 적힌 시험(네트워크나 브라우저가 필요한 것)은 기본 실행에서 빼고 --live일 때만 돌린다.
// 여러 시험이 dist를 읽으므로 npm run build 뒤에 돌린다.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const live = new Set(
  fs.readFileSync(path.join(dir, 'tests-live.txt'), 'utf8')
    .split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean),
);
const all = fs.readdirSync(dir).filter((f) => /^test-.*\.cjs$/.test(f)).sort();
for (const f of live) if (!all.includes(f)) throw new Error(`tests-live.txt에 없는 시험이 있다: ${f}`);
const wantLive = process.argv.includes('--live');
const files = all.filter((f) => live.has(f) === wantLive);

const failed = [];
const t0 = Date.now();
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8' });
  if (r.status === 0) continue;
  failed.push(f);
  console.log(`FAIL ${f} (exit ${r.status ?? r.signal})\n${r.stdout}${r.stderr}`);
}
console.log(`${files.length - failed.length}/${files.length} 통과, ${((Date.now() - t0) / 1000).toFixed(1)}s${wantLive ? ' (live)' : ''}`);
if (failed.length) {
  console.log(`실패: ${failed.join(' ')}`);
  process.exit(1);
}
