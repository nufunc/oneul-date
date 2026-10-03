// 앱 네이버 지도 검색어(P-052). src/main.ts의 mapQuery와 의존 선언을 잘라 typescript로 옮겨 돌린다(본문을 복사하지 않아 main.ts와 어긋나지 않는다).
// 입력은 [{id, name, area, location, address, region}] JSON, 출력은 {id: 검색어} JSON이다:
//   node scripts/app_map_query.mjs in.json out.json
import fs from 'node:fs';
import ts from 'typescript';

const src = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
// 최상위 선언은 첫 열의 } 나 ]; 나 }; 줄에서 끝난다
const block = (re) => {
  const i = src.search(re);
  if (i < 0) throw new Error(`main.ts에서 ${re}를 찾지 못했다`);
  const m = /^(\}|\];|\};)\s*$/m.exec(src.slice(i));
  return src.slice(i, i + m.index + m[0].length);
};
const code = [/^const KNOWN_NAME_MAP/m, /^const FAMOUS_AREAS/m, /^function spotArea/m, /^function mapQuery/m].map(block).join('\n\n');
const js = ts.transpileModule(`${code}\nexport { mapQuery };\n`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { mapQuery } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const [inFile, outFile] = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(inFile, 'utf8'));
fs.writeFileSync(outFile, JSON.stringify(Object.fromEntries(rows.map((r) => [r.id, mapQuery(r)]))));
