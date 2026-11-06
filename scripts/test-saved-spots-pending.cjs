// 캐시 없는 첫 로드에서 저장한 코스 시트의 장소 칸이 전체 데이터 도착 뒤 채워지는지 시험(P-309): node scripts/test-saved-spots-pending.cjs
// src/main.ts를 읽어 본다: 받는 중에는 `(장소 정보 없음)`과 다른 표시를 내고, 로드가 끝나면(성공이든 실패든)
// 시트를 통째로 다시 그리지 않고 장소 칸만 바꾸는지
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const body = (startRe, endRe) => {
  const s = src.search(startRe);
  assert.ok(s >= 0, `없다: ${startRe}`);
  const rest = src.slice(s);
  const e = rest.slice(1).search(endRe);
  assert.ok(e >= 0, `끝을 찾지 못했다: ${endRe}`);
  return rest.slice(0, e + 1);
};

// 1. 받는 중이면 사라진 장소 문구가 아닌 대기 문구를 낸다. 대기 판정이 사라진 장소 문구보다 앞이다
const html = body(/^function savedCourseSpotsHtml\(/m, /^\}/m);
const pending = html.search(/if \(fullSpotsPending\) return [^\n]*data-spots-loading[^\n]*spotsWaitLabel\(\)/);
const gone = html.indexOf('(장소 정보 없음)');
assert.ok(pending >= 0, '받는 중(fullSpotsPending)일 때 대기 표시를 내지 않는다');
assert.ok(gone > pending, '사라진 장소 문구가 대기 표시보다 앞에 있다');
assert.ok(!html.slice(pending, gone).includes('(장소 정보 없음)'), '대기 표시가 사라진 장소 문구를 함께 낸다');

// 2. 도착 뒤 갱신은 장소 칸만 바꾼다: 시트가 열려 있을 때만, 통째로 다시 그리지 않는다
const refresh = body(/^function refreshSavedSpots\(/m, /^\}/m);
assert.match(refresh, /if \(!state\.savedOpen\) return;/, '시트가 닫혀 있어도 갱신한다');
assert.match(refresh, /\.saved-item-spots/, '장소 칸(.saved-item-spots)만 바꾸지 않는다');
assert.match(refresh, /innerHTML = savedCourseSpotsHtml\(item\)/, '장소 칸을 savedCourseSpotsHtml로 다시 채우지 않는다');
assert.ok(!/renderOverlay(Content)?\(/.test(refresh), '시트를 통째로 다시 그려 스크롤과 포커스가 처음으로 돌아간다');

// 3. 로드가 끝나면 대기 해제 뒤 갱신하고, 기다리는 코스가 없어도 갱신한다(성공과 실패 모두 finally로 온다)
const resolve = body(/^function resolveWaitingCourse\(/m, /^\}/m);
const off = resolve.indexOf('fullSpotsPending = false;');
const call = resolve.indexOf('refreshSavedSpots();');
const early = resolve.indexOf('if (!courseWaitingForSpots) return;');
assert.ok(off >= 0 && call > off, '대기를 해제한 뒤 refreshSavedSpots()를 부르지 않는다');
assert.ok(early > call, 'refreshSavedSpots()가 기다리는 코스 없음 조기 반환 뒤에 있어 갱신이 빠진다');
assert.match(src, /\.finally\(resolveWaitingCourse\)/, '로드 성공·실패 모두 resolveWaitingCourse로 오지 않는다');

console.log('saved-spots-pending: ok');
