// scripts/test-*.cjs를 CPU 수만큼 나란히 돌리고 하나라도 실패하면 1로 끝난다.
// 파일을 쓰는 시험은 모두 mkdtemp 임시 폴더에 쓰므로 나란히 돌려도 서로 겹치지 않는다.
// scripts/tests-live.txt에 적힌 시험(네트워크나 브라우저가 필요한 것)은 기본 실행에서 빼고 --live일 때만 돌린다.
// 여러 시험이 dist를 읽으므로 npm run build 뒤에 돌린다.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

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
const runOne = (f) => new Promise((resolve) => {
  const child = spawn(process.execPath, [path.join(dir, f)]);
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', (code, signal) => {
    if (code !== 0) {
      failed.push(f);
      console.log(`FAIL ${f} (exit ${code ?? signal})\n${out}`);
    }
    resolve();
  });
});
const queue = [...files];
const worker = async () => { while (queue.length) await runOne(queue.shift()); };
const n = Math.max(1, Math.min(os.availableParallelism ? os.availableParallelism() : os.cpus().length, files.length));
Promise.all(Array.from({ length: n }, worker)).then(() => {
  console.log(`${files.length - failed.length}/${files.length} 통과, ${((Date.now() - t0) / 1000).toFixed(1)}s, 동시 ${n}${wantLive ? ' (live)' : ''}`);
  if (failed.length) {
    console.log(`실패: ${failed.sort().join(' ')}`);
    process.exit(1);
  }
});
