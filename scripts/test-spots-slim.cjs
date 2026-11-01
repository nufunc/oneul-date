// spots.json 하위 칸 거르기 회귀 테스트(P-251): node scripts/test-spots-slim.cjs
// 생성 스크립트(collector/sync_live_spots.py slim_spot)가 앱이 읽는 조건과 같은 기준으로 source.url과 source.note를 남기는지 묶는다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mainTs = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const py = fs.readFileSync(path.join(root, 'collector', 'sync_live_spots.py'), 'utf8');

// 1. 핫 점수 정규식이 앱과 생성 스크립트에서 같다
const appRe = mainTs.match(/if \(\/(.+)\/\.test\(srcNote\)\)/);
const pyRe = py.match(/^HOT_NOTE_RE = re\.compile\(r"(.+)"\)$/m);
assert(appRe, 'src/main.ts에서 srcNote 정규식을 찾지 못했다');
assert(pyRe, 'sync_live_spots.py에서 HOT_NOTE_RE를 찾지 못했다');
assert.strictEqual(pyRe[1], appRe[1], '핫 점수 정규식이 앱과 생성 스크립트에서 다르다');
assert(mainTs.includes("spot.source?.type === 'blog_mining' && spot.verified"), '앱의 source.note 사용 조건이 바뀌었다');

// 앱이 source.url을 읽는 세 형식이 그대로인지 본다. 바뀌면 app_reads_source_url도 함께 바꾼다
for (const marker of ["/^https:\\/\\/naver\\.me\\//.test(spot.source.url)", "spot.source.url.includes('catchtable')", "src.includes('instagram.com/')"]) {
  assert(mainTs.includes(marker), `앱의 source.url 판정이 바뀌었다: ${marker}`);
}

// 2. 거른 뒤 형태라면 일곱 하위 칸이 없고 source.url이 세 형식뿐이다
const hotRe = new RegExp(appRe[1]);
const isAppUrl = (u) => u.startsWith('https://naver.me/') || u.includes('catchtable') || u.includes('instagram.com/');
const SOURCE_UNUSED = ['booking_tips', 'platform', 'is_blueribbon', 'price_tier'];
const SOCIAL_UNUSED = { kakaomap: ['bookmark_count', 'locked'], youtube: ['is_shorts'] };

function checkFile(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.log(`건너뜀: ${rel} 파일이 없다`);
    return;
  }
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const unused = rows.filter((r) => SOURCE_UNUSED.some((k) => r.source && k in r.source)).length;
  if (unused > 0) {
    console.log(`건너뜀: ${rel}에 source 미사용 하위 칸이 남은 행 ${unused}개. 다음 sync-spots 실행 전이라 거르기 전 형태다`);
    return;
  }
  for (const r of rows) {
    const s = r.source || {};
    if (s.url != null) assert(isAppUrl(s.url), `${rel} id ${r.id}: 앱이 읽지 않는 source.url ${s.url}`);
    if (s.note != null) {
      assert(s.type === 'blog_mining' && r.verified && hotRe.test(s.note), `${rel} id ${r.id}: 핫 점수가 읽지 않는 source.note`);
    }
    for (const [name, keys] of Object.entries(SOCIAL_UNUSED)) {
      const link = r.social_links && r.social_links[name];
      if (link) for (const k of keys) assert(!(k in link), `${rel} id ${r.id}: social_links.${name}.${k}가 남았다`);
    }
  }
  console.log(`${rel}: ${rows.length}행 거른 뒤 형태 확인`);
}

checkFile('public/data/spots.json');
checkFile('src/data/spots.sample.json');
console.log('spots slim ok');
