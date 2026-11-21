// 애드센스 빌드 시험: node scripts/test-adsense.cjs
// 임시 dist에 앱, 매거진 글, data 아래 HTML을 두고 build_adsense.mjs를 두 번 돌려
// </head> 앞에 스크립트가 한 번만 들어가는지, data는 건드리지 않는지, ads.txt가 같은 게시자 ID인지 본다(P-536).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adsense-'));
const files = {
  app: path.join(tmp, 'dist', 'index.html'),
  post: path.join(tmp, 'dist', 'blog', 'p', 'index.html'),
  data: path.join(tmp, 'dist', 'data', 'x.html'),
};
for (const f of Object.values(files)) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, '<html><head><title>t</title></head><body></body></html>');
}
const run = () => execFileSync('node', [path.join(root, 'scripts', 'build_adsense.mjs'), path.join(tmp, 'dist')]);
run();
run();
const tag = /<script async src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-9593341318585134" crossorigin="anonymous"><\/script>\n<\/head>/;
for (const k of ['app', 'post']) {
  const html = fs.readFileSync(files[k], 'utf8');
  assert.ok(tag.test(html), `${k}: </head> 앞에 스크립트가 없다`);
  assert.strictEqual(html.split('adsbygoogle.js').length - 1, 1, `${k}: 스크립트가 한 번이 아니다`);
}
assert.ok(!fs.readFileSync(files.data, 'utf8').includes('adsbygoogle'), 'data 아래 HTML을 건드렸다');
assert.strictEqual(fs.readFileSync(path.join(root, 'public', 'ads.txt'), 'utf8'),
  'google.com, pub-9593341318585134, DIRECT, f08c47fec0942fa0\n', 'ads.txt 게시자 ID가 다르다');
fs.rmSync(tmp, { recursive: true });
console.log('adsense OK');
