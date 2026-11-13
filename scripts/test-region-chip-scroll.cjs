// 지역 칩 줄 가로 위치 보정 시험(P-353): node scripts/test-region-chip-scroll.cjs
// 켜진 지역 칩이 줄 밖이면 가운데로 스크롤하고, 이미 보이면 scrollLeft를 그대로 두는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
// 계산은 P-417에서 revealChipInRow로 뗐으므로 둘을 함께 떼어 온다
const cut = (marker) => {
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `${marker}가 없다`);
  return src.slice(start, src.indexOf('\n}\n', start) + 2);
};
const body = `${cut('function revealActiveRegionChip(')}\n${cut('function revealChipInRow(')}`
  .replace(/\(container: HTMLElement\): void/, '(container)')
  .replace(/\(row: HTMLElement, chip: HTMLElement\): void/, '(row, chip)')
  .replace(/<HTMLElement>/g, '');
const reveal = new Function(`${body}; return revealActiveRegionChip;`)();

// 줄 오른쪽 padding은 20px(흐림 가림 폭)
global.getComputedStyle = () => ({ paddingRight: '20px' });

// 줄 폭 244px, 줄 왼쪽 x 16. 칩은 scrollLeft만큼 왼쪽으로 밀려 그려진다
function makeRow(chipLeft, chipWidth) {
  const row = {
    scrollLeft: 0,
    clientWidth: 244,
    getBoundingClientRect: () => ({ left: 16, right: 260 }),
    querySelector: (sel) => (sel === '.is-active[data-region-key]' && chipLeft !== null ? chip : null),
  };
  const chip = {
    offsetWidth: chipWidth,
    getBoundingClientRect: () => ({ left: chipLeft - row.scrollLeft, right: chipLeft - row.scrollLeft + chipWidth }),
  };
  const calls = [];
  const container = {
    querySelector: (sel) => {
      calls.push(sel);
      return row;
    },
  };
  return { row, container, calls };
}

// 줄 오른쪽 밖(x 474~521)의 켜진 칩: 가운데로 오도록 스크롤
let t = makeRow(474, 47);
reveal(t.container);
assert.ok(t.row.scrollLeft > 0, '줄 밖 칩인데 scrollLeft가 0이다');
assert.ok(t.calls[0].includes(':not(.quick-mood-row)'), '무드 줄을 제외하지 않았다');
const c = 474 - t.row.scrollLeft;
assert.ok(Math.abs(c + 47 / 2 - (16 + 244 / 2)) < 1, '칩이 줄 가운데에 오지 않았다');

// 이미 보이는 칩은 그대로
t = makeRow(40, 47);
reveal(t.container);
assert.strictEqual(t.row.scrollLeft, 0, '보이는 칩인데 scrollLeft가 바뀌었다');

// 줄 안이지만 오른쪽 흐림 가림(x 240~260) 위에 걸친 칩도 가운데로
t = makeRow(200, 47);
reveal(t.container);
assert.ok(t.row.scrollLeft > 0, '가림에 걸친 칩인데 scrollLeft가 0이다');

// 켜진 칩이 없으면 아무 일도 없다
t = makeRow(null, 47);
reveal(t.container);
assert.strictEqual(t.row.scrollLeft, 0);

console.log('test-region-chip-scroll: 통과');
