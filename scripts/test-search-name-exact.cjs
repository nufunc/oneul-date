// 이름 검색 회귀 테스트: node scripts/test-search-name-exact.cjs
// 판정 함수를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행하고, 스팟(public/data/spots.json)과 역 좌표를 실제 파일로 쓴다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const start = src.indexOf('type SlotKey');
const bizMatches = src.indexOf('function bizMatches(');
const end = src.indexOf(';\n', src.indexOf('const BIZ_SUFFIX')) + 2;
assert.ok(start >= 0 && bizMatches > start && end > bizMatches, '떼어 낼 구간을 찾지 못했다');
const js = ts.transpile(src.slice(start, end).replace(/^export /gm, ''), { target: 'es2022' }).replace(/^export \{\};/gm, '');

const all = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'spots.json'), 'utf8'));
const { stations } = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'stations.json'), 'utf8'));
const env = { rawSpotsData: all, cleanSpotSummary: (s) => s.summary || '', __st: stations };
const names = 'isCourseEligible,deduplicateSpotList,matchesSearchQuery,isListicleEntry,isPollutedMediaChannelDummy';
const m = new Function(...Object.keys(env), `${js};stationCoords=__st;return {${names}};`)(...Object.values(env));

const open = all.filter((s) => !s.is_closed);
const candidates = m.deduplicateSpotList(open.filter((s) => m.isCourseEligible(s)));
const hits = (q) => candidates.filter((s) => m.matchesSearchQuery(s, q)).length;
const fake = (name) => ({ name });

// 후보 관문을 지나는 실제 장소는 이름 그대로 치면 찾힌다
for (const q of ['블루가든아카이브', '아카이브', '오르에르 아카이브', '스퀘어21 선유도역점', '군산항', '제주항', '대전사', '청풍자연농원영농조합법인']) {
  if (open.some((s) => s.name === q)) assert.ok(hits(q) > 0, `${q}는 이름 검색에서 찾혀야 한다`);
}
// 한 글자 이름과 지역어 + 한 글자 이름은 이름이 같을 때만 통과한다
assert.strictEqual(m.matchesSearchQuery(fake('군산항'), '군산항'), true, '지역어 + 한 글자 이름은 이름이 같으면 찾힌다');
assert.strictEqual(m.matchesSearchQuery(fake('결'), '결'), true, '한 글자 이름은 이름이 같으면 찾힌다');
assert.strictEqual(m.matchesSearchQuery(fake('군산항'), 'ㅇㅇ'), false, '이름이 다른 검색어는 통과시키지 않는다');
assert.strictEqual(m.matchesSearchQuery(fake('Blue Garden'), ' blue garden '), true, '대소문자와 앞뒤 공백은 보지 않는다');

// 실제 장소 이름은 목차 관문에 걸리지 않고, 목차형 이름은 여전히 걸린다
for (const n of ['블루가든아카이브', '오르에르 아카이브', '스퀘어21 선유도역점', '러스틱 아카이브 성수']) {
  assert.strictEqual(m.isListicleEntry(fake(n)), false, `${n}는 목차 항목이 아니다`);
}
for (const n of ['서울 데이트 코스 20선', '성수 맛집 10 선 상세 명세', '카페 마크다운 정리', 'Part 2. 성수', '트렌드 분석']) {
  assert.strictEqual(m.isListicleEntry(fake(n)), true, `${n}는 목차 항목이다`);
}
assert.strictEqual(m.isListicleEntry(fake('20선착순')), false, '선착은 목차가 아니다');

// 방송 채널명 지표 '풍자'는 낱말일 때만 걸린다
assert.strictEqual(m.isPollutedMediaChannelDummy(fake('청풍자연농원영농조합법인')), false, '청풍자연은 채널명이 아니다');
assert.strictEqual(m.isPollutedMediaChannelDummy(fake('풍자 또간집 성수')), true, '풍자 또간집은 채널명이다');
assert.strictEqual(m.isPollutedMediaChannelDummy(fake('성수 풍자')), true, '낱말 풍자는 채널명이다');

// 끝난 행사는 이름 검색에서도 여전히 빠진다(후보 관문은 그대로다)
for (const q of ['군산시간여행축제', '천안흥타령춤축제']) assert.strictEqual(hits(q), 0, `${q}는 끝난 행사라 0건이다`);

console.log('test-search-name-exact: 모두 통과');
