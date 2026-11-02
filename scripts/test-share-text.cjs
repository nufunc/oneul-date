// 공유 시트 코스 문구 회귀 테스트: node scripts/test-share-text.cjs
// courseShareText와 shareOrCopyLink를 src/main.ts에서 그대로 떼어 TypeScript로 변환해 실행한다(앱 번들과 같은 코드를 검사)
// 문구 형식(넷 이하, 넷 초과의 "외 N곳", 지역 접두, 못 찾은 id 건너뛰기)과 공유 시트에 text가 실리는지,
// 공유 시트가 없을 때 클립보드에는 주소 한 줄만 들어가는지 본다(P-266)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const cut = (from, to) => {
  const start = src.indexOf(from);
  assert(start >= 0, `src/main.ts에 ${from}이 없다`);
  return src.slice(start, src.indexOf(to, start) + to.length);
};
const code = [
  cut('function courseShareText', '\n}\n'),
  cut('async function shareOrCopyLink', '\n}\n'),
  cut('async function copyOrShowText', '\n}\n'),
].join('\n');

const spotById = new Map(
  ['가 카페', '나 식당', '다 공원', '라 바', '마 숙소', '바 전시'].map((name, i) => [i + 1, { id: i + 1, name }]),
);
const toasts = [];
const sheets = [];
const nav = { share: undefined, clipboard: { writeText: async (t) => nav.copied.push(t) }, shared: [], copied: [] };
const stubs = {
  spotById,
  regionsLabel: (regions, zones) => (zones.length > 0 ? '성수' : regions.join('·')),
  showToast: (msg) => toasts.push(msg),
  navigator: nav,
  document: { activeElement: null },
  openCopySheet: (text) => sheets.push(text),
};
const { courseShareText, shareOrCopyLink } = new Function(
  ...Object.keys(stubs),
  `${ts.transpile(code, { target: 'es2022' })};return { courseShareText, shareOrCopyLink };`,
)(...Object.values(stubs));

// 넷 이하: 모두 화살표로 잇는다
assert.strictEqual(courseShareText([1, 2, 3]), '데이트 코스 3곳: 가 카페 → 나 식당 → 다 공원');
assert.strictEqual(courseShareText([1, 2, 3, 4]), '데이트 코스 4곳: 가 카페 → 나 식당 → 다 공원 → 라 바');
// 넷 초과: 넷까지 보이고 나머지는 "외 N곳"
assert.strictEqual(courseShareText([1, 2, 3, 4, 5, 6]), '데이트 코스 6곳: 가 카페 → 나 식당 → 다 공원 → 라 바 외 2곳');
// 지역 접두: 지역이나 구역이 있으면 붙이고, 없으면(전국) 붙이지 않는다
assert.strictEqual(courseShareText([1, 2], ['SEOUL']), 'SEOUL 데이트 코스 2곳: 가 카페 → 나 식당');
assert.strictEqual(courseShareText([1, 2], ['SEOUL'], ['seongsu']), '성수 데이트 코스 2곳: 가 카페 → 나 식당');
assert.strictEqual(courseShareText([1, 2], [], []), '데이트 코스 2곳: 가 카페 → 나 식당');
// 못 찾은 id는 건너뛰고 곳 수도 찾은 것만 센다. 하나도 못 찾으면 문구를 넘기지 않는다
assert.strictEqual(courseShareText([99, 1, 98, 2]), '데이트 코스 2곳: 가 카페 → 나 식당');
assert.strictEqual(courseShareText([99, 98]), undefined);
assert.strictEqual(courseShareText([]), undefined);

(async () => {
  const url = 'https://example.test/#c=1.2.3';
  // 공유 시트가 있으면 title, text, url을 함께 넘긴다
  nav.share = async (data) => nav.shared.push(data);
  await shareOrCopyLink(url, 0, courseShareText([1, 2, 3]));
  assert.deepStrictEqual(nav.shared, [{ title: '오늘 데이트', text: '데이트 코스 3곳: 가 카페 → 나 식당 → 다 공원', url }]);
  assert.deepStrictEqual(nav.copied, []);

  // 공유 시트가 없으면 클립보드에는 주소 한 줄만 복사한다
  nav.share = undefined;
  await shareOrCopyLink(url, 0, courseShareText([1, 2, 3]));
  assert.deepStrictEqual(nav.copied, [url]);
  assert.strictEqual(toasts.at(-1), '🔗 공유 링크가 복사되었어요');

  // 공유 시트가 취소 외 이유로 실패해도 클립보드에는 주소 한 줄만 간다
  nav.share = async () => {
    throw new Error('NotAllowedError');
  };
  await shareOrCopyLink(url, 0, '데이트 코스 1곳: 가 카페');
  assert.deepStrictEqual(nav.copied, [url, url]);

  // 클립보드가 거부되면 토스트 대신 주소 시트를 연다(P-269)
  nav.share = undefined;
  const n = toasts.length;
  nav.clipboard.writeText = async () => {
    throw new Error('NotAllowedError');
  };
  await shareOrCopyLink(url, 0, '데이트 코스 1곳: 가 카페');
  assert.deepStrictEqual(sheets, [url]);
  assert.strictEqual(toasts.length, n);

  console.log('test-share-text: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
