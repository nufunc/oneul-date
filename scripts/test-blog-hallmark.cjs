// 매거진 Hallmark 변환 시험(P-293): node scripts/test-blog-hallmark.cjs
// 임시 글 틀(원본 구조의 축소판)을 convert_blog_hallmark.mjs로 바꿔 보존 비교가 통과하는지,
// 링크·이미지·JSON-LD·헤딩·본문·메타 중 하나라도 달라진 변환본은 compare가 잡는지, 모르는 틀은 변환이 실패하는지 본다.
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const COURSE = '../../#c=111.222.333';
const original = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>[시험 드라이브] 하루 코스</title>
  <meta name="description" content="시험 글">
  <link rel="canonical" href="https://nufunc.github.io/oneul-date/blog/test/">
  <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
  <script type="application/ld+json">
{"@context":"https://schema.org","@type":"BlogPosting","headline":"[시험 드라이브] 하루 코스","datePublished":"2026-10-30"}
  </script>
  <style>
    :root { --color-accent: #e11d48; }
    body { background: #f8fafc; }
  </style>
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <a href="https://nufunc.github.io/oneul-date/blog/" class="header-logo">오늘 데이트 <span>매거진</span></a>
      <nav class="header-nav"><a href="https://nufunc.github.io/oneul-date/">홈으로</a></nav>
    </div>
  </header>
  <main class="article-container">
    <article>
      <header class="article-header">
        <span class="badge-category">시험 · 두 곳 코스</span>
        <h1 class="article-title">[시험 드라이브] 하루 코스</h1>
        <div class="article-meta">
          <span>📅 2026.10.30</span>
          <span>🚗 차량 이동 약 5km</span>
          <span>글: 시험 팀 / 사진: 한국관광공사</span>
        </div>
      </header>
      <div class="prose-intro">
        시험 글의 첫 문단이에요.
      </div>
      <!-- 동선 -->
      <section class="timeline-card">
        <h3 class="timeline-title">⏱️ 시험 동선</h3>
        <div class="tl-act">오전: 첫째 곳</div>
        <div class="tl-step"><span class="tl-time">10:30</span><div><span class="tl-place">첫째 곳</span><span class="tl-note">10:00~18:00</span></div></div>
        <div class="tl-move">↓ 차로 약 5km (약 8분)</div>
        <div class="tl-act">오후: 둘째 곳</div>
        <div class="tl-step"><span class="tl-time">13:00</span><div><span class="tl-place">둘째 곳</span><span class="tl-note">상시 개방</span></div></div>
        <div class="tl-move">두 곳 사이 차량 이동 합계 약 5km</div>
      </section>
      <section class="spot-section">
        <div class="spot-header">
          <span class="spot-num">1</span>
          <h2 class="spot-title">첫째 곳</h2>
        </div>
        <div class="spot-tagline">첫째 곳 한 줄</div>
        <div class="spot-image-wrap">
          <img src="https://example.com/a.jpg" alt="첫째 곳 전경" class="spot-image" loading="lazy" />
        </div>
        <p class="spot-desc">
          첫째 곳 설명이에요.
        </p>
        <div class="spot-info-box">
          <div class="info-row">
            <span class="info-label">주소</span>
            <span class="info-val">시험시 시험로 1</span>
          </div>
        </div>
        <div class="map-btn-wrap">
          <a href="https://map.naver.com/p/search/%EC%8B%9C%ED%97%98" target="_blank" rel="noopener noreferrer" class="btn-naver-map">
            🧭 네이버 지도 바로가기
          </a>
        </div>
      </section>
      <section class="spot-section">
        <div class="spot-header">
          <span class="spot-num">2</span>
          <h2 class="spot-title">둘째 곳</h2>
        </div>
        <div class="spot-tagline">둘째 곳 한 줄</div>
        <div class="spot-image-wrap">
          <img src="https://example.com/b.jpg" alt="둘째 곳 전경" class="spot-image" loading="lazy" />
        </div>
        <p class="spot-desc">
          둘째 곳 설명이에요.
        </p>
      </section>
      <section class="cost-table-card">
        <h3 class="timeline-title">💰 시험 입장료</h3>
        <p>시험 표예요.</p>
        <div class="table-wrap">
          <table class="cost-table">
            <thead><tr><th>구분</th><th>장소</th><th>2인 금액</th><th>비고</th></tr></thead>
            <tbody>
              <tr><td>유적</td><td>첫째 곳</td><td>무료</td><td></td></tr>
              <tr class="cost-total-row"><td colspan="2">2인 합계</td><td>0원</td><td>시험</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <div class="app-course-box" style="margin: 40px 0 24px;">
        <strong style="display: block;">🗺️ 이 코스 시험에서 열기</strong>
        <p style="margin: 0;">앱 코스 상자 문단이에요.</p>
        <a href="${COURSE}" style="display: inline-block;">앱에서 코스 열기 →</a>
      </div>
      <footer style="margin-top: 40px;">
        <p>사진 출처: 한국관광공사</p>
      </footer>
    </article>
  </main>
  <footer class="site-footer">
    <div style="max-width: 760px; margin: 0 auto;">
      <p style="margin-bottom: 8px;"><strong>오늘 데이트 (Oneul Date)</strong> · 전국 데이트 & 여행 코스 큐레이션 매거진</p>
      <p><a href="https://nufunc.github.io/oneul-date/">홈으로 가기</a> · <a href="https://nufunc.github.io/oneul-date/blog/">매거진 전체보기</a></p>
    </div>
  </footer>
</body>
</html>
`;

(async () => {
  const { convert, compare, snapshot } = await import(pathToFileURL(path.join(__dirname, 'convert_blog_hallmark.mjs')).href);

  // 1. 변환이 통과하고 보존 항목이 그대로다
  const out = convert(original);
  assert.deepStrictEqual(compare(original, out), [], '변환본이 보존 비교를 통과하지 못했다');
  assert.strictEqual(convert(out), null, '이미 바꾼 글을 다시 바꾸려 했다');

  // 2. 새 틀의 약속: 1번 장소 사진은 그 장소 구획 안, 첫 화면 앱 버튼은 기존 코스 링크와 같은 주소, 이모지와 ↓→는 없다
  const hero = out.match(/<header class="article-header hero container">[\s\S]*?<\/header>/)[0];
  assert.ok(!hero.includes('<img'), '첫 화면에 사진이 있다');
  assert.ok(hero.includes(`<a class="btn" href="${COURSE}">`), '첫 화면 앱 버튼 주소가 기존 코스 링크와 다르다');
  const spot1 = out.match(/<section class="spot-section">[\s\S]*?<\/section>/)[0];
  assert.ok(spot1.includes('https://example.com/a.jpg') && spot1.includes('<figure class="spot-photo'), '1번 장소 사진이 제자리에 없다');
  assert.ok(out.includes('<section class="spot-section flip">'), '짝수 장소에 flip이 없다');
  assert.ok(!/[\p{Extended_Pictographic}↓→]/u.test(out), '이모지나 ↓→가 남았다');
  assert.ok(out.includes('hallmark-solstice') && out.includes('fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@700&display=swap&text='), 'CSS나 제목 글꼴 링크가 없다');
  assert.ok(out.includes('<div class="route" style="--n:2">'), '동선 열 수가 틀렸다');
  assert.ok(out.includes('<div class="tl-total" style="--r:4">두 곳 사이'), '동선 합계 줄이 tl-total이 아니다');

  // 3. 빌드 후처리와 다른 시험이 기대하는 것이 새 CSS에 있다
  const css = require('fs').readFileSync(path.join(__dirname, 'blog_hallmark.css'), 'utf8');
  assert.match(css, /--font-family:\s*"Pretendard Variable",/, '--font-family 첫 순위가 Pretendard Variable이 아니다(test-blog-fonts)');
  assert.match(css, /header:not\(\.article-header\) a\{min-height:44px/, '머리 링크 44px 규칙이 없다(test-blog-related)');
  assert.match(css, /:focus-visible\s*\{/, '키보드 초점 스타일이 없다');

  // 4. 보존 비교가 달라진 변환본을 잡는다
  const cases = [
    ['링크', (h) => h.replace('https://nufunc.github.io/oneul-date/">홈으로', 'https://example.com/">홈으로'), /링크/],
    ['이미지 src', (h) => h.replace('https://example.com/a.jpg', 'https://example.com/z.jpg'), /이미지/],
    ['이미지 alt', (h) => h.replace('alt="첫째 곳 전경"', 'alt="다른 설명"'), /이미지/],
    ['JSON-LD', (h) => h.replace('"datePublished":"2026-10-30"', '"datePublished":"2026-10-31"'), /JSON-LD/],
    ['헤딩', (h) => h.replace('<h2 class="spot-title">둘째 곳</h2>', '<h2 class="spot-title">둘째 장소</h2>'), /헤딩/],
    ['본문', (h) => h.replace('첫째 곳 설명이에요.', '첫째 곳 설명이다.'), /본문/],
    ['메타', (h) => h.replace('content="시험 글"', 'content="바뀐 글"'), /메타/],
    ['링크 추가', (h) => h.replace('</main>', '<a href="https://example.com/new">새 링크</a></main>'), /원본에 없던 링크/],
  ];
  for (const [name, tamper, re] of cases) {
    const errors = compare(original, tamper(out));
    assert.ok(errors.some((e) => re.test(e)), `${name}이 달라졌는데 compare가 잡지 못했다: ${JSON.stringify(errors)}`);
  }

  // 5. 모르는 틀은 파일을 만들지 않고 실패한다
  assert.throws(() => convert(original.replace('<p class="spot-desc">', '<div class="other-box">팁</div>\n<p class="spot-desc">')), /모르는 요소/, '모르는 요소가 있는데 변환이 실패하지 않았다');
  assert.throws(() => convert(original.replace('<div class="app-course-box"', '<div class="other-box"')), /모르는 요소/, '모르는 앱 코스 상자 틀인데 변환이 실패하지 않았다');
  assert.throws(() => convert(original.replace('<section class="timeline-card">', '<section class="timeline-other">')), /동선 구획|모르는/, '동선 틀이 모르는 것인데 변환이 실패하지 않았다');

  // 6. 팁 상자, article-lead 도입, 앱 코스 상자 없음(첫 화면 버튼도 없음)은 통과한다
  const variant = original
    .replace('<p class="spot-desc">\n          첫째 곳 설명이에요.', '<div class="tip-box">\n          <strong>💡 꿀팁</strong><br>\n          월요일은 쉬어요.\n        </div>\n        <p class="spot-desc">\n          첫째 곳 설명이에요.')
    .replace('<div class="prose-intro">', '<div class="article-lead">')
    .replace(/<div class="app-course-box"[\s\S]*?<\/div>\s*(?=<footer)/, '')
    .replace(/href="\.\.\/\.\.\/#c=[^"]*"/g, 'href="https://example.com/"');
  const vout = convert(variant);
  assert.deepStrictEqual(compare(variant, vout), [], '변형본(팁, article-lead, 앱 상자 없음)이 보존 비교를 통과하지 못했다');
  assert.ok(vout.includes('<div class="tip-box"><strong class="tip-title">꿀팁</strong>월요일은 쉬어요.</div>'), '팁 상자 제목이 새 틀이 아니다');
  assert.ok(vout.includes('<p class="prose-intro">') && !vout.includes('app-course-box"'), 'article-lead가 prose-intro가 되지 않았거나 앱 상자가 생겼다');
  const noIntro = variant.replace(/<div class="article-lead">[\s\S]*?<\/div>/, '');
  assert.ok(!convert(noIntro).includes('prose-intro"'), '도입이 없는 글에 도입이 생겼다');

  // 7. 두 번째 계열(timeline-list, table-wrap 없는 3열 경비표, 팁 구획)
  const listOriginal = original
    .replace(/<section class="timeline-card">[\s\S]*?<\/section>/, `<section class="timeline-card">
        <h3 class="timeline-title">🧭 시험 타임라인</h3>
        <div class="timeline-meta-box">
          <div class="meta-item"><strong>권역</strong>: 시험시</div>
        </div>
        <div class="timeline-list">
          <div class="timeline-item">
            <span class="timeline-badge">1</span>
            <div class="timeline-content">
              <div class="timeline-time">10:30 - 11:45</div>
              <div class="timeline-spot">첫째 곳</div>
              <div class="timeline-desc">첫째 곳 산책</div>
            </div>
          </div>
        </div>
      </section>`)
    .replace(/<div class="table-wrap">\s*(<table[\s\S]*?<\/table>)\s*<\/div>/, (all, t) => t.replace('<th>구분</th><th>장소</th><th>2인 금액</th><th>비고</th>', '<th>구분</th><th>세부</th><th>금액</th>').replace('<td></td>', '').replace('<td colspan="2">2인 합계</td><td>0원</td><td>시험</td>', '<td>합계</td><td>시험</td><td>0원</td>'))
    .replace('<div class="app-course-box"', '<section class="tips-card"><h3 class="timeline-title">💡 시험 팁</h3><ul class="tips-list"><li><strong>준비</strong>: 신발</li></ul></section>\n      <div class="app-course-box"');
  const lout = convert(listOriginal);
  assert.deepStrictEqual(compare(listOriginal, lout), [], '두 번째 계열이 보존 비교를 통과하지 못했다');
  assert.ok(lout.includes('<span class="tl-badge">1</span><span class="tl-time">10:30 - 11:45</span>') && lout.includes('class="tl-facts"') && lout.includes('class="cost-table cost-3"') && lout.includes('<section class="tips-card">'), '두 번째 계열의 새 틀이 아니다');

  // 8. 셋째 계열(real-photo-flat): 페이지 틀 전체가 다른 평면 글. 보존 비교는 <main> 안만 견주고 사진 설명은 순서대로 따로 견준다
  const flat = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>[시험] 평면 글</title>
  <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
  <style> body { margin: 0; } </style>
</head>
<body>
  <header class="travel-header-bar"><div class="header-inner"><div class="header-title"><a href="../">← 📖 오늘 데이트 매거진</a></div></div></header>
  <main class="article-wrap">
    <span class="post-badge">시험 · 평면</span>
    <h1>[시험] 평면 글</h1>
    <div class="post-sub-meta"><span>글: 시험 팀</span><span>•</span><span>발행: 2026년 10월 11일</span></div>
    <div class="lead-box">평면 글의 도입이에요.<br><br>둘째 문단이에요.</div>
    <div class="real-photo-card"><img src="https://example.com/lead.jpg" alt="대표"><div class="photo-caption">대표 사진 (출처: 시험)</div></div>
    <h2>🗺️ 시험 동선</h2>
    <div class="timeline-card">
      <div class="tl-act">오전: 첫째</div>
      <div class="tl-step"><span class="tl-time">10:00</span><span class="tl-place">첫째 곳</span><span class="tl-note">산책</span></div>
      <div class="tl-move">차량 이동 약 5분</div>
    </div>
    <h2>1. 첫째 곳 이야기</h2>
    <p>첫째 곳은 조용해요.</p>
    <div class="guide-box"><h4>📍 첫째 곳 안내</h4><ul><li>주소: 시험시</li></ul></div>
    <div class="real-photo-card"><img src="https://example.com/a.jpg" alt="첫째"><div class="photo-caption">첫째 사진 (출처: 시험)</div></div>
    <p>사진 뒤 문단이에요.</p>
    <div class="tip-box"><strong>💡 팁:</strong> 일찍 가요.</div>
    <div class="map-btn-wrap"><a href="https://map.naver.com/p/search/a" class="map-btn" target="_blank" rel="noopener noreferrer">🧭 지도 보기</a></div>
    <h2>💰 예상 경비</h2>
    <div class="table-wrap"><table><thead><tr><th>구분</th><th>장소</th><th>금액</th><th>비고</th></tr></thead><tbody><tr><td>관람</td><td>첫째 곳</td><td>0원</td><td>무료</td></tr><tr style="font-weight: 700;"><td colspan="2">합계</td><td style="color: red;">0원</td><td></td></tr></tbody></table></div>
    <h2>📍 지도 바로가기</h2>
    <ul><li><a href="https://map.naver.com/p/search/a" target="_blank" rel="noopener noreferrer">첫째 곳</a></li></ul>
    <div class="app-course-box" style="margin: 40px 0;"><strong style="display:block;">🗺️ 이 코스 열기</strong><p style="margin:0;">앱에서 열어요.</p><a href="${COURSE}" style="display:inline-block;">앱에서 코스 열기 →</a></div>
    <footer class="article-footer"><p>© 2026 시험</p></footer>
  </main>
</body>
</html>`;
  const fout = convert(flat);
  assert.deepStrictEqual(compare(flat, fout), [], '셋째 계열이 보존 비교를 통과하지 못했다');
  assert.ok(fout.includes('<section class="spot-section flat">') && fout.includes('<figure class="spot-photo spot-image-wrap">') && fout.includes('<figure class="lead-photo">'), '셋째 계열 장소 구획과 사진 틀이 아니다');
  assert.ok(fout.includes('<tr class="cost-total-row">') && fout.includes('class="cost-table cost-3"') === false && fout.includes('<table class="cost-table">'), '경비표 틀이 아니다');
  assert.ok(fout.includes('<header class="site-header">') && fout.includes('<footer class="site-footer">') && !fout.includes('travel-header-bar'), '머리나 푸터가 새 틀이 아니다');
  assert.ok(/<a class="btn" href="[^"]*#c=/.test(fout), '첫 화면 앱 버튼이 없다');
  assert.throws(() => convert(flat.replace('<p>첫째 곳은 조용해요.</p>', '<p>첫째 곳은 조용해요.</p><blockquote>모름</blockquote>')), /모르는 요소/, '셋째 계열에서 모르는 요소가 있는데 변환이 실패하지 않았다');
  assert.ok(compare(flat, fout.replace('대표 사진 (출처: 시험)', '다른 설명')).some((e) => /사진 설명/.test(e)), '사진 설명이 달라졌는데 compare가 잡지 못했다');
  assert.strictEqual(snapshot(out).links.length, snapshot(original).links.length + 1, '링크 수는 첫 화면 앱 버튼 하나만 늘어야 한다');
  console.log(`test-blog-hallmark: 변환 보존 비교, 새 틀 약속, 달라진 변환본 ${cases.length}건, 모르는 틀 실패 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
