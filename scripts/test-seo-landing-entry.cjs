// 지역 랜딩 첫 지역·시간대 시험(P-488): npm run build 뒤 node scripts/test-seo-landing-entry.cjs
// 랜딩 32쪽마다 #seo-landing에 앱 지역 키·시간대 data 속성이 있고, 하단 링크가 같은 값을 ?r=·?s=로 싣는지 본다
// 앱이 그 값을 알려진 키만 받아 첫 상태로 쓰고, 루트에는 랜딩 구획이 없어 첫 화면이 그대로인지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');

const APP_REGION = { seoul: 'SEOUL', gyeonggi: 'GYEONGGI', incheon: 'GYEONGGI', gangwon: 'GANGWON', chungcheong: 'CHUNGCHEONG', yeongnam: 'YEONGNAM', honam: 'HONAM', jeju: 'JEJU' };
const SLOTS = ['day', 'evening', 'night', 'stay'];

let count = 0;
for (const [slug, app] of Object.entries(APP_REGION)) {
  for (const slot of SLOTS) {
    const f = path.join(dist, slug, slot, 'index.html');
    if (!fs.existsSync(f)) continue;
    count += 1;
    const html = fs.readFileSync(f, 'utf8');
    const rel = `${slug}/${slot}`;
    assert.ok(html.includes(`<section id="seo-landing" data-region="${app}" data-slot="${slot}"`), `${rel}: 랜딩 구획에 지역·시간대 data 속성이 없다`);
    assert.ok(html.includes(`<a href="https://nufunc.github.io/oneul-date/?r=${app}&amp;s=${slot}">오늘 데이트에서 직접 코스 만들기 →</a>`), `${rel}: 하단 링크가 같은 지역·시간대를 싣지 않는다`);
  }
}
assert.strictEqual(count, 32, `지역 랜딩이 32쪽이 아니다: ${count}`);
assert.ok(!fs.readFileSync(path.join(dist, 'index.html'), 'utf8').includes('seo-landing'), '루트 index.html에 랜딩 구획이 있다');

// 앱: 랜딩 data 속성 다음 쿼리 순으로 읽고, 알려진 키만 받는다
const entry = src.slice(src.indexOf('const entryArea = '), src.indexOf('const state: AppState'));
assert.ok(/document\.getElementById\('seo-landing'\)\?\.dataset/.test(entry), '랜딩 data 속성을 읽지 않는다');
assert.ok(/landing\?\.region \?\? query\.get\('r'\)/.test(entry) && /landing\?\.slot \?\? query\.get\('s'\)/.test(entry), '쿼리 r·s를 읽지 않는다');
assert.ok(/REGIONS\.some\(\(r\) => r\.key !== 'ALL' && r\.key === region\)/.test(entry), '알 수 없는 지역 키를 버리지 않는다');
assert.ok(/SLOT_ORDER\.find\(\(k\) => k === slot\) \?\? null/.test(entry), '알 수 없는 시간대 키를 버리지 않는다');
const stateInit = src.slice(src.indexOf('const state: AppState'), src.indexOf('};', src.indexOf('const state: AppState')));
assert.ok(/slots: entryArea\.slot \? \{ \.\.\.getDefaultSlots\(\), \[entryArea\.slot\]: true \} : getDefaultSlots\(\)/.test(stateInit), '첫 시간대가 루트 기본 칸에 랜딩 시간대를 더한 집합이 아니다(P-490)');
assert.ok(/regions: entryArea\.region \? \[entryArea\.region\] : \[\]/.test(stateInit), '첫 지역을 랜딩 값으로 두지 않는다');
// 오늘 추천 코스와 GPS 자동 지역이 랜딩 값을 덮지 않는다
assert.ok(/state\.subZones\.length > 0 \|\| entryArea\.region \|\| entryArea\.slot\) return;/.test(src), '오늘 추천 코스가 랜딩 값을 덮는다');
assert.ok(/detected !== 'SEOUL' && !entryArea\.region\)/.test(src), 'GPS 자동 지역이 랜딩 지역을 덮는다');
// 공유 링크는 앱이 받은 코스에서 지역을 다시 정하므로 r·s를 싣지 않는다(P-374)
const share = src.slice(src.indexOf('function buildShareUrl('), src.indexOf('\n}\n', src.indexOf('function buildShareUrl(')));
assert.ok(!/'r'|'s'/.test(share), '공유 링크에 r·s를 싣는다');

console.log('test-seo-landing-entry: 통과');
