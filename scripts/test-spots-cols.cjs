// 열 형식 spots.cols.json 회귀 테스트: node scripts/test-spots-cols.cjs
// rowsFromColumns(src/supabase.ts)를 그대로 떼어 실행하고, spots.cols.json이 있으면 spots.json과 행마다 같은지 본다.
// P-453: 첫 방문 전체 받기만 열 형식으로 바꾸고 받은 링크 Range는 행 파일을 읽으므로 두 파일이 같은 데이터여야 한다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const supa = fs.readFileSync(path.join(root, 'src', 'supabase.ts'), 'utf8');
const start = supa.indexOf('export function rowsFromColumns');
assert.ok(start >= 0, 'rowsFromColumns가 없다');
const code = supa.slice(start, supa.indexOf('\n}\n', start) + 3).replace(/^export /gm, '');
const rowsFromColumns = new Function(`${ts.transpile(code, { target: 'es2022' })};return rowsFromColumns;`)();

const rows = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'spots.json'), 'utf8'));
const toCols = (list) => {
  const cols = {};
  for (const k of Object.keys(list[0])) cols[k] = list.map((r) => r[k]);
  return cols;
};

// 1. 열 형식으로 바꾼 행 파일을 되돌리면 같은 행이다. null과 칸 순서도 그대로다
const back = rowsFromColumns(toCols(rows));
assert.strictEqual(back.length, rows.length);
assert.strictEqual(JSON.stringify(back), JSON.stringify(rows), '열→행 변환이 행 파일과 다르다');

// 2. 열 형식이 아닌 본문은 빈 배열이다(호출부가 샘플로 떨어진다)
for (const bad of [null, {}, { id: 3 }, 'x', 5]) assert.deepStrictEqual(rowsFromColumns(bad), []);

// 3. 수집기가 낸 spots.cols.json이 있으면 spots.json과 행 수, id 순서, 행마다 값이 같다
const colsPath = path.join(root, 'public', 'data', 'spots.cols.json');
if (fs.existsSync(colsPath)) {
  const cols = JSON.parse(fs.readFileSync(colsPath, 'utf8'));
  assert.deepStrictEqual(Object.keys(cols), Object.keys(rows[0]), '칸 목록이나 순서가 행 파일과 다르다');
  for (const k of Object.keys(cols)) assert.strictEqual(cols[k].length, rows.length, `${k} 칸 길이가 행 수와 다르다`);
  assert.deepStrictEqual(cols.id, rows.map((r) => r.id), 'id 순서가 행 파일과 다르다');
  assert.strictEqual(JSON.stringify(rowsFromColumns(cols)), JSON.stringify(rows), '열 형식 파일이 행 파일과 다르다');
  console.log(`ok test-spots-cols (${rows.length}행, spots.cols.json 비교)`);
} else {
  console.log(`ok test-spots-cols (${rows.length}행, spots.cols.json 없음)`);
}
