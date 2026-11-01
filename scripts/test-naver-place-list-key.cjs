// 네이버 pcmap 목록 키 고르기 시험(P-254): node scripts/test-naver-place-list-key.cjs
// naver_place_search.mjs의 placeList를 소스에서 꺼내 망 없이 ROOT_QUERY 키 문자열로 돌린다.
// 관광지 목록의 빈 filter 입력("false", "")만 있는 키는 고르고, 음식점 목록의 "영업 중" 필터("true")가 걸린 키는 버리는지 본다
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'naver_place_search.mjs'), 'utf8');
const body = src.match(/function placeList\(root\) \{[\s\S]*?\n\}/);
assert.ok(body, 'naver_place_search.mjs에서 placeList를 찾지 못했다');
const placeList = new Function(`${body[0]};return placeList;`)();

// 2026-11-02 pcmap 응답에서 옮긴 키(좌표만 줄였다)
const attraction = 'placeList({"input":{"businessType":"attraction","deviceType":"pcmap","display":50,"filterCoupon":"false","filterOpentime":"false","filterWheelchairEntrance":"false","isPcmap":true,"keyword":"장안공원","query":"장안공원","sortingOrder":"trendy","start":0,"x":"127.01","y":"37.28"}})';
const plain = 'placeList({"input":{"deviceType":"pcmap","display":50,"isCurrentLocationSearch":null,"isPcmap":true,"query":"정지영커피로스터즈","start":1,"x":"127.01","y":"37.28"}})';
const opening = 'placeList({"input":{"deviceType":"pcmap","display":9,"filterOpening":"true","isCurrentLocationSearch":null,"isNx":false,"isPcmap":true,"query":"정지영커피로스터즈","start":1,"x":"127.01","y":"37.28"}})';
const biz = (name) => ({ businesses: { total: 1, name } });

// 1. 관광지 목록: 빈 filter 입력만 있는 키를 고른다
assert.strictEqual(placeList({ [attraction]: biz('attraction') })?.name, 'attraction', '빈 filter 입력만 있는 관광지 목록을 고르지 못했다');
// 2. 음식점 목록: 필터가 걸린 키가 앞에 있어도 필터 없는 키를 고른다
assert.strictEqual(placeList({ [opening]: biz('opening'), [plain]: biz('plain') })?.name, 'plain', '필터 없는 음식점 목록을 고르지 못했다');
// 3. 필터가 걸린 키만 있으면 고르지 않는다
assert.strictEqual(placeList({ [opening]: biz('opening') }), undefined, '"영업 중" 필터가 걸린 목록을 골랐다');
// 4. 빈 값이 아닌 filter가 하나라도 섞이면 버린다
const mixed = attraction.replace('"filterOpentime":"false"', '"filterOpentime":"true"');
assert.strictEqual(placeList({ [mixed]: biz('mixed') }), undefined, '걸린 filter가 섞인 키를 골랐다');
const valued = attraction.replace('"filterCoupon":"false"', '"filterCoupon":"falsey"');
assert.strictEqual(placeList({ [valued]: biz('valued') }), undefined, '"false"로 시작하는 다른 값을 빈 값으로 봤다');
// 5. 빈 문자열, 불리언 false, null도 빈 값으로 본다
const empty = attraction.replace('"filterCoupon":"false"', '"filterCoupon":""').replace('"filterOpentime":"false"', '"filterOpentime":false').replace('"filterWheelchairEntrance":"false"', '"filterWheelchairEntrance":null');
assert.strictEqual(placeList({ [empty]: biz('empty') })?.name, 'empty', '"", false, null filter를 빈 값으로 보지 않았다');
// 6. placeList 키가 없으면(캡차, 접근 제한) 고르지 않는다
assert.strictEqual(placeList({ 'other({})': biz('x') }), undefined, 'placeList가 아닌 키를 골랐다');

console.log('ok naver-place-list-key');
