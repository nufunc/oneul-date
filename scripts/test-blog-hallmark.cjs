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

  // 8. 장소 카드 계열(spot-card): 대표 사진, 요약 상자, 이동 연결, 앱 코스 상자가 article 밖, site-footer의 문단 셋
  const card = original
    .replace(/<div class="prose-intro">[\s\S]*?<\/div>/, `<div class="hero-image-wrap"><img class="hero-image" src="https://example.com/h.jpg" alt="대표 사진" /><div class="hero-caption">대표 사진 설명</div></div>
      <div class="summary-box"><div class="summary-title"><span>🌾</span> 시험 요약</div><ul class="summary-list"><li><strong>테마</strong>: 시험 코스</li></ul></div>`)
    .replace(/<section class="timeline-card">[\s\S]*?<\/section>/, `<section class="timeline-card">
        <div class="timeline-title">시험 동선</div>
        <div class="tl-act">오전: 첫째 곳</div>
        <div class="tl-step"><span class="tl-time">10:30</span><div><span class="tl-place">첫째 곳</span><span class="tl-note">상시 개방</span></div></div>
        <div class="tl-move">↓ 차로 약 5km (약 8분)</div>
        <div class="tl-step"><span class="tl-time">13:00</span><div><span class="tl-place">둘째 곳</span><span class="tl-note">무료</span></div></div>
        <div class="tl-move">차량 이동 합계 약 5km</div>
      </section>
      <section class="content-section"><h2>1. 프롤로그</h2><p>시험 프롤로그예요.</p></section>`)
    .replace(/<section class="spot-section">[\s\S]*<\/section>\s*(?=<section class="cost-table-card">)/, `<section class="content-section">
        <h2>2. 세부 코스 안내</h2>
        <div class="spot-card">
          <div class="spot-image-wrap"><img class="spot-image" src="https://example.com/a.jpg" alt="첫째 곳 전경" /><span class="spot-badge">스팟 01</span></div>
          <div class="spot-content">
            <div class="spot-title-wrap"><h3 class="spot-title">첫째 곳</h3><span class="spot-category">시험 한 줄</span></div>
            <ul class="spot-info-list"><li>📍 <strong>위치</strong>: 시험시 시험로 1</li><li>⏰ 상시 개방</li></ul>
            <div class="spot-actions"><a href="https://map.naver.com/p/search/a" target="_blank" rel="noopener noreferrer" class="action-chip chip-naver">🧭 네이버 지도 바로가기 ↗</a></div>
            <p class="spot-desc">첫째 곳 설명이에요.</p>
            <div class="tip-box"><span class="tip-icon">💡</span><div><strong>팁</strong>: 일찍 가요.</div></div>
          </div>
        </div>
        <div class="drive-bridge"><span class="bridge-icon">🚗</span><div><strong>드라이브 이동</strong>: 약 5km</div></div>
        <div class="spot-card">
          <div class="spot-content">
            <div class="spot-title-wrap"><h3 class="spot-title">둘째 곳</h3><span class="spot-category">사진 없는 곳</span></div>
            <p class="spot-desc">둘째 곳 설명이에요.</p>
          </div>
        </div>
      </section>
      `)
    .replace(/<section class="cost-table-card">\s*<h3 class="timeline-title">([\s\S]*?)<\/h3>/, '<section class="content-section"><h2>3. $1</h2>')
    .replace(/(<div class="app-course-box"[\s\S]*?<\/div>)\s*(<footer style="margin-top: 40px;">[\s\S]*?<\/footer>)\s*<\/article>/, '<div class="cta-card"><h3>시험 CTA</h3><p>코스를 만들어 보세요.</p><a href="../../" class="cta-btn">코스 만들기 ↗</a></div>\n    </article>\n    $1')
    .replace(/<footer class="site-footer">[\s\S]*?<\/footer>/, '<footer class="site-footer"><p>사진은 시험이 제공했어요.</p><p class="source-credit">출처: 시험</p></footer>');
  const cout = convert(card);
  assert.deepStrictEqual(compare(card, cout), [], '장소 카드 계열이 보존 비교를 통과하지 못했다');
  assert.ok(cout.includes('<figure class="hero-figure">') && cout.includes('<div class="summary-card">') && cout.includes('<p class="timeline-title">시험 동선</p>'), '장소 카드 계열의 첫 구획이 새 틀이 아니다');
  assert.ok(cout.includes('<div class="spots bridged">') && cout.includes('<p class="drive-bridge"><strong>드라이브 이동</strong>: 약 5km</p>') && cout.includes('<section class="spot-section no-photo">'), '장소 카드 계열의 세부 코스 틀이 아니다');
  assert.ok(cout.includes('<div class="info-row"><span class="info-label">위치:</span>') && cout.includes('<div class="info-row plain">'), '장소 카드 계열 정보 줄이 새 틀이 아니다');
  assert.ok(/<a class="btn" href="[^"]*#c=/.test(cout) && cout.includes('<footer class="site-footer">') && cout.includes('<p class="footer-line">출처: 시험</p>'), '장소 카드 계열의 앱 버튼이나 푸터가 새 틀이 아니다');
  assert.throws(() => convert(card.replace('<p class="spot-desc">둘째 곳 설명이에요.</p>', '<blockquote>모름</blockquote>')), /모르는 요소/, '장소 카드 계열에서 모르는 요소가 있는데 변환이 실패하지 않았다');

  // 9. 정보 격자 계열(real-photo-grid): main 아래 h2·p·real-photo-card·info-grid가 한 줄로 이어지고, 사진은 글 순서 그대로 둔다
  const grid = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>[시험] 격자 글</title>
  <link rel="canonical" href="https://nufunc.github.io/oneul-date/blog/grid/">
  <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
  <script type="application/ld+json">
{"@context":"https://schema.org","@type":"BlogPosting","headline":"격자","datePublished":"2026-10-30"}
  </script>
  <style>body { background: #fff; }</style>
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <a href="/oneul-date/" class="header-logo">오늘 데이트 <span>매거진</span></a>
      <nav class="header-nav"><a href="/oneul-date/blog/">매거진 목록</a></nav>
    </div>
  </header>
  <main class="article-container">
    <div class="post-badge">시험 지역 · 가을</div>
    <h1>[시험] 격자 글 제목</h1>
    <div class="post-meta"><span>작성일: 2026-10-30</span><span>·</span><span>글: 오늘 데이트 에디토리얼 팀 / 사진: 시험</span></div>
    <p class="intro-lead">시험 도입이에요.</p>
    <section class="course-summary-card">
      <div class="summary-card-title">🗓️ 시험 동선 한눈에</div>
      <div class="tl-act">오전 1막: 첫째</div>
      <div class="tl-step"><span class="tl-time">10:00</span><span class="tl-place">첫째 곳</span><span class="tl-note">산책</span></div>
      <div class="tl-move">↓ 차량 약 5km</div>
      <div class="tl-step"><span class="tl-time">12:00</span><span class="tl-place">둘째 곳</span><span class="tl-note">점심</span></div>
    </section>
    <h2>1. 첫째 곳, 시험 제목</h2>
    <p>첫째 곳 앞 문단이에요.</p>
    <div class="real-photo-card"><img src="https://example.com/a.jpg" alt="첫째 곳 전경" loading="lazy"><div class="photo-caption"><span>첫째 곳 전경</span><span>출처: 시험</span></div></div>
    <p>첫째 곳 뒤 문단이에요.</p>
    <div class="info-grid"><div class="info-item"><span class="info-label">주소</span><span class="info-val">시험시 시험로 1</span></div><div class="info-item"><span class="info-label">입장료</span><span class="info-val">무료</span></div></div>
    <div class="tip-box"><div class="tip-title">💡 에디터 팁</div>일찍 가요.</div>
    <div class="map-btn-wrap"><a href="https://map.naver.com/p/search/a" target="_blank" rel="noopener noreferrer" class="map-btn">🧭 네이버 지도로 확인하기</a></div>
    <h2>💰 시험 경비</h2>
    <div class="table-wrap"><table><thead><tr><th>구분</th><th>장소</th><th>금액</th><th>비고</th></tr></thead><tbody>
      <tr><td>오전</td><td>첫째 곳</td><td>0원</td><td>무료</td></tr>
      <tr style="background-color: #f8fafc; font-weight: 700;"><td colspan="2">합계</td><td style="color: red;">0원</td><td>무료 코스</td></tr>
    </tbody></table></div>
    <h2>📍 시험 지도</h2>
    <ul class="spot-links"><li><a href="https://map.naver.com/p/search/a" target="_blank" rel="noopener noreferrer">🧭 첫째 곳</a></li></ul>
    <section class="outro-card"><div class="outro-title">✨ 총평</div><p style="margin-bottom: 0;">시험 총평이에요.</p></section>
    <div class="app-course-box" style="margin: 40px 0 24px;"><strong style="display: block;">🗺️ 이 코스 오늘 데이트에서 열기</strong><p style="margin: 0;">장소 2곳을 열어요.</p><a href="${COURSE}" style="display: inline-block;">앱에서 코스 열기 →</a></div>
    <footer class="article-footer"><p>사진 출처: 시험</p><p style="margin-top: 6px;">© 2026 시험</p></footer>
  </main>
</body>
</html>`;
  const gout = convert(grid);
  assert.deepStrictEqual(compare(grid, gout), [], '정보 격자 계열이 보존 비교를 통과하지 못했다');
  assert.ok(gout.includes('<section class="story-section">') && gout.includes('<figure class="story-photo">') && gout.includes('<div class="spot-info-box info-wide">') && gout.includes('<p class="timeline-title">시험 동선 한눈에</p>'), '정보 격자 계열의 장소 구획이나 동선 제목이 새 틀이 아니다');
  assert.ok(gout.indexOf('첫째 곳 앞 문단') < gout.indexOf('<figure class="story-photo">') && gout.indexOf('<figure class="story-photo">') < gout.indexOf('첫째 곳 뒤 문단'), '정보 격자 계열이 사진을 글 순서대로 두지 않았다');
  assert.ok(gout.includes('<tr class="cost-total-row">') && gout.includes('<div class="cta-card">') && /<a class="btn" href="[^"]*#c=/.test(gout), '정보 격자 계열의 경비표, 마무리 상자, 앱 버튼이 새 틀이 아니다');
  assert.throws(() => convert(grid.replace('<p>첫째 곳 뒤 문단이에요.</p>', '<blockquote>모름</blockquote>')), /모르는 요소/, '정보 격자 계열에서 모르는 요소가 있는데 변환이 실패하지 않았다');

  // 10. 지도 칩 줄 계열(spot-chips): 대표 사진형(budget-section, source-notice, back-btn-wrap, 푸터 없음)과 article 밖 앱 코스 상자
  const chips = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>[시험] 칩 글</title>
  <link rel="canonical" href="https://nufunc.github.io/oneul-date/blog/chips/">
  <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
  <script type="application/ld+json">
{"@context":"https://schema.org","@type":"BlogPosting","headline":"칩","datePublished":"2026-10-30"}
  </script>
  <style>body { background: #fff; }</style>
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <a href="https://nufunc.github.io/oneul-date/" class="header-logo">오늘 데이트 <span>매거진</span></a>
      <nav class="header-nav"><a href="https://nufunc.github.io/oneul-date/blog/">매거진 목록</a></nav>
    </div>
  </header>
  <main class="article-container">
    <article>
      <header class="article-header">
        <span class="badge-category">시험 지역 · 시험 코스</span>
        <h1 class="article-title">[시험] 칩 글 하루 코스</h1>
        <div class="article-meta"><span>📅 2026.10.30</span><span>글: 시험 팀 / 사진: 시험</span></div>
      </header>
      <div class="hero-image-wrap">
        <img src="https://example.com/h.jpg" alt="대표 사진" class="hero-image" />
        <p class="image-caption">대표 사진 설명</p>
      </div>
      <div class="prose-intro">시험 도입이에요.</div>
      <section class="timeline-card">
        <h2 class="timeline-title">시험 동선</h2>
        <div class="tl-act">오전: 첫째 곳</div>
        <div class="tl-step"><span class="tl-time">10:00</span><div><span class="tl-place">첫째 곳</span><span class="tl-note">무료</span></div></div>
        <div class="tl-move">↓ 차로 약 5km (약 8분)</div>
        <div class="tl-step"><span class="tl-time">12:00</span><div><span class="tl-place">둘째 곳</span><span class="tl-note">무료</span></div></div>
      </section>
      <section class="spot-section">
        <div class="spot-header"><span class="spot-number">01</span><h2 class="spot-title">첫째 곳</h2><span class="spot-tag">시험 태그</span></div>
        <div class="spot-image-wrap"><img src="https://example.com/a.jpg" alt="첫째 곳 전경" class="spot-image" loading="lazy" /><p class="image-caption">첫째 곳 사진 설명</p></div>
        <p class="spot-desc">첫째 곳 설명이에요.</p>
        <div class="spot-chips-row">
          <a href="https://map.naver.com/p/search/a" target="_blank" rel="noopener noreferrer" class="spot-chip-btn map-chip">🗺️ 네이버 지도</a>
          <a href="tmap://search?name=a" class="spot-chip-btn">🧭 T맵 길안내</a>
        </div>
        <div class="tip-box"><div class="tip-box-title">💡 이용 정보</div>• 주소: 시험시 시험로 1<br>• 입장료: 무료</div>
      </section>
      <section class="spot-section">
        <div class="spot-header"><span class="spot-number">02</span><h2 class="spot-title">둘째 곳</h2><span class="spot-tag">사진 없는 곳</span></div>
        <p class="spot-desc">둘째 곳 설명이에요.</p>
      </section>
      <section class="budget-section">
        <h2 class="budget-title">💰 2인 예상 입장료</h2>
        <p>시험 경비예요.</p>
        <div class="table-wrap"><table class="cost-table"><thead><tr><th>구분</th><th>장소</th><th>2인 금액</th><th>비고</th></tr></thead><tbody><tr><td>입장</td><td>첫째 곳</td><td>0원</td><td>무료</td></tr><tr class="cost-total-row"><td colspan="2">2인 합계</td><td>0원</td><td>별도</td></tr></tbody></table></div>
      </section>
      <div class="source-notice">사진 출처: 시험</div>
      <div class="back-btn-wrap"><a href="https://nufunc.github.io/oneul-date/blog/" class="back-btn">← 매거진 목록으로 돌아가기</a></div>
    </article>
    <div class="app-course-box" style="margin: 40px 0 24px;">
      <strong style="display: block;">🗺️ 이 코스 오늘 데이트에서 열기</strong>
      <p style="margin: 0;">시험 코스를 앱에서 열어요.</p>
      <a href="${COURSE}" style="display: inline-block;">앱에서 코스 열기 →</a>
    </div>
  </main>
</body>
</html>
`;
  const chout = convert(chips);
  assert.deepStrictEqual(compare(chips, chout), [], '지도 칩 줄 계열이 보존 비교를 통과하지 못했다');
  assert.ok(chout.includes('<figure class="hero-figure">') && chout.includes('<figcaption>첫째 곳 사진 설명</figcaption>') && chout.includes('<section class="spot-section no-photo">'), '지도 칩 줄 계열의 사진 틀이 아니다');
  assert.ok(chout.includes('<div class="map-btn-wrap spot-actions">') && chout.includes('<strong class="tip-title">이용 정보</strong>') && chout.includes('<p class="spot-tagline">시험 태그</p>'), '지도 칩 줄 계열의 지도 버튼이나 팁 상자가 새 틀이 아니다');
  assert.ok(chout.includes('<section class="cost-table-card">') && chout.includes('<p class="back-link">') && chout.includes('<footer class="article-credit tight">') && /<a class="btn" href="[^"]*#c=/.test(chout), '지도 칩 줄 계열의 경비표, 돌아가기, 앱 버튼이 새 틀이 아니다');
  assert.throws(() => convert(chips.replace('<p class="spot-desc">둘째 곳 설명이에요.</p>', '<blockquote>모름</blockquote>')), /모르는 요소/, '지도 칩 줄 계열에서 모르는 요소가 있는데 변환이 실패하지 않았다');

  // route-timeline 계열(보령, 거제, 고성): article.spot-section과 route-timeline이 main 아래에 평평하게 이어지는 틀
  const head = original.slice(0, original.indexOf('<body>'));
  const route = `${head}<body>
  <header class="site-header">
    <div class="header-inner">
      <a href="https://nufunc.github.io/oneul-date/" class="header-logo">오늘 데이트 <span>매거진</span></a>
      <nav class="header-nav"><a href="https://nufunc.github.io/oneul-date/blog/">전체 글 보기</a></nav>
    </div>
  </header>
  <main class="article-container">
    <header class="article-header">
      <span class="badge">시험도 · 바다 드라이브</span>
      <h1>[시험도 드라이브] 하루 코스</h1>
      <div class="meta-info"><span>발행일: 2026년 10월 21일</span><span>·</span><span>글: 시험 팀 / 사진: 시험</span></div>
    </header>
    <div class="intro-box">시험도는 바다와 숲을 하루에 둘러보는 코스예요.</div>
    <section class="overview-card">
      <h2 class="overview-title">🚗 시험도 타임라인</h2>
      <p style="margin: 0 0 12px;">휴무일을 확인하세요.</p>
      <div class="route-timeline">
        <div class="timeline-item"><span class="timeline-time">10:30 ~ 11:50</span><span class="timeline-name"><strong>[스팟 1] 첫째 곳</strong> (바이크 탑승)</span></div>
        <div class="timeline-item"><span class="timeline-time">12:00 ~ 13:30</span><span class="timeline-name"><strong>[스팟 2] 둘째 곳</strong> (산책)</span><span class="timeline-dist">(차량 6.6km · 약 10분)</span></div>
      </div>
    </section>
    <article class="spot-section">
      <div class="spot-header"><div><span class="spot-number">SPOT 1</span><h2 class="spot-title">첫째 곳</h2><div class="spot-chips"><span class="chip">칩 하나</span><span class="chip">칩 둘</span></div></div></div>
      <div class="spot-image-wrap"><img src="https://example.com/a.jpg" alt="첫째 곳 전경" class="spot-image" loading="lazy"><div class="image-caption">첫째 곳 사진<span style="display: block; margin-top: 4px;">출처: 시험</span></div></div>
      <ul class="spot-info-list"><li><span class="spot-info-label">주소</span><span class="spot-info-val">시험시 시험로 1</span></li></ul>
      <p class="spot-desc">첫째 곳 설명이에요.</p>
      <div class="tip-box"><div class="tip-box-title">💡 에디터 방문 팁</div>일찍 가세요.</div>
      <div class="action-chips"><a href="https://map.naver.com/p/search/a" target="_blank" rel="noopener noreferrer" class="btn-map">🧭 네이버 지도에서 위치 보기</a></div>
    </article>
    <section class="cost-section">
      <h2 class="cost-title">💰 2인 예상 경비표</h2>
      <p class="cost-sub">시험 경비예요.</p>
      <div class="table-wrap"><table><thead><tr><th>구분</th><th>장소</th><th>2인 금액</th><th>비고</th></tr></thead><tbody><tr><td>입장</td><td>첫째 곳</td><td>1,000원</td><td>시험</td></tr><tr style="background-color: #f8fafc; font-weight: 700;"><td colspan="2">합계</td><td style="color: red;">1,000원</td><td>별도</td></tr></tbody></table></div>
    </section>
    <div class="conclusion-box"><h2 class="conclusion-title">✨ 에디터 총평</h2><p>총평 하나예요.</p><p>총평 둘이에요.</p></div>
    <div class="app-course-box" style="margin: 40px 0 24px;">
      <strong style="display: block;">🗺️ 이 코스 오늘 데이트에서 열기</strong>
      <p style="margin: 0;">시험 코스를 앱에서 열어요.</p>
      <a href="${COURSE}" style="display: inline-block;">앱에서 코스 열기 →</a>
    </div>
  </main>
  <footer class="site-footer">
    <div class="footer-links"><a href="https://nufunc.github.io/oneul-date/">오늘 데이트 홈</a><a href="https://nufunc.github.io/oneul-date/blog/">블로그 매거진 전체보기</a></div>
    <p>© 2026 오늘 데이트</p>
  </footer>
</body>
</html>
`;
  const rout = convert(route);
  assert.deepStrictEqual(compare(route, rout), [], 'route-timeline 계열이 보존 비교를 통과하지 못했다');
  assert.ok(rout.includes('<div class="route range" style="--n:2">') && rout.includes('<em class="tl-meta">(차량 6.6km · 약 10분)</em>') && rout.includes('<p class="spot-tagline">칩 하나 · 칩 둘</p>'), 'route-timeline 계열의 동선이나 칩 줄이 새 틀이 아니다');
  assert.ok(rout.includes('<span class="cap-src">출처: 시험</span>') && rout.includes('<table class="cost-table">') && rout.includes('<tr class="cost-total-row">') && rout.includes('<section class="prose-section">') && /<a class="btn" href="[^"]*#c=/.test(rout), 'route-timeline 계열의 사진 출처나 경비표나 총평이 새 틀이 아니다');
  assert.throws(() => convert(route.replace('<p class="spot-desc">첫째 곳 설명이에요.</p>', '<blockquote>모름</blockquote>')), /모르는 요소/, 'route-timeline 계열에서 모르는 요소가 있는데 변환이 실패하지 않았다');

  // spot-block 계열(강릉, 경주): article.article-card 안에 동선 상자, 장소 구획, 이동 연결, 경비표, 지도 상자, 에필로그가 이어지는 틀
  const block = `${head}<body>
  <header class="travel-header-bar">
    <div class="header-inner">
      <div class="blog-tagline"><a href="../" style="text-decoration:none;">← 📖 오늘 데이트 매거진</a></div>
      <div class="read-time">시험 1박 2일 편</div>
    </div>
  </header>
  <main class="article-container">
    <article class="article-card">
      <span class="post-badge">시험 1박 2일 여행 코스</span>
      <h1 class="post-title">[시험 1박 2일 여행] 쉼 코스</h1>
      <div class="post-quote">"조용한 시험 여행이에요."</div>
      <div class="post-meta-row"><div class="author-info"><div class="author-avatar">🌊</div><div><div>시험 팀</div><div style="font-size: 12px;">2026. 10.</div></div></div><div>시험시 일대</div></div>
      <div class="content-photo"><img src="https://example.com/h.jpg" alt="대표 사진" loading="lazy"><div class="photo-caption">대표 사진 설명이에요.</div></div>
      <p class="lead-paragraph">도입 하나예요.</p>
      <p class="lead-paragraph">도입 <strong>둘</strong>이에요.</p>
      <div class="itinerary-box">
        <div class="itinerary-header"><span>🗺️</span> 시험 동선 요약</div>
        <div style="margin-bottom: 14px;"><span class="day-pill">Day 1</span><span style="font-size: 13px;">첫날 이야기</span></div>
        <div class="itinerary-step"><span class="time-tag">12:00</span><span><strong>첫째 곳</strong> : 점심 먹기</span></div>
        <div style="margin: 20px 0 14px;"><span class="day-pill">Day 2</span><span style="font-size: 13px;">둘째 날 이야기</span></div>
        <div class="itinerary-step"><span class="time-tag">11:00</span><span>느긋한 체크아웃</span></div>
      </div>
      <p class="spot-text">영업시간은 바뀔 수 있어요.</p>
      <section class="spot-block">
        <div class="spot-badge-wrap"><span class="spot-num">SPOT 01</span><span class="spot-category-label">점심 & 산책</span></div>
        <h2 class="spot-title">첫째 곳, 골목의 식당</h2>
        <p class="spot-text">첫째 곳 설명이에요.</p>
        <div class="content-photo"><img src="https://example.com/a.jpg" alt="첫째 곳 전경" loading="lazy"><div class="photo-caption">첫째 곳 사진 설명이에요.</div></div>
        <div class="tip-card"><div class="tip-card-title">💡 방문 꿀팁</div><ul><li><strong>주차</strong>: 공영주차장</li></ul></div>
      </section>
      <div class="bridge-card"><span class="bridge-icon">🚗</span><div>차로 10분 거리로 이동해요.</div></div>
      <section class="spot-block">
        <div class="spot-badge-wrap"><span class="spot-num">SPOT 02</span><span class="spot-category-label">아침</span></div>
        <h2 class="spot-title">둘째 곳</h2>
        <p class="spot-text">둘째 곳 설명이에요.</p>
      </section>
      <div style="margin: 50px 0 20px; display: inline-block;"><span style="font-weight: 800;">☀️ Day 2: 아침과 여운</span></div>
      <section class="expense-section">
        <div class="expense-title"><span>💰</span> 2인 예상 경비</div>
        <p class="expense-desc">경비 설명이에요.</p>
        <div class="table-responsive"><table class="expense-table"><thead><tr><th>구분</th><th>항목</th><th>상세</th><th style="text-align: right;">금액</th></tr></thead><tbody><tr><td><strong>점심</strong></td><td>첫째 곳</td><td>국수</td><td style="text-align: right;">9,000원</td></tr><tr class="total-row"><td colspan="3"><strong>합계</strong></td><td style="text-align: right;">9,000원</td></tr></tbody></table></div>
      </section>
      <section class="map-box">
        <div class="map-box-title">🧭 지도 바로가기</div>
        <div class="map-box-desc">아래 링크에서 확인하세요:</div>
        <div style="display: flex;"><a class="naver-btn" style="padding: 8px;" href="https://map.naver.com/p/search/a" target="_blank" rel="noopener noreferrer">🍜 첫째 곳</a></div>
      </section>
      <section style="margin-top: 48px;"><h3 style="font-size: 20px;">에필로그: 위로</h3><p class="spot-text">에필로그 하나예요.</p><p class="spot-text" style="margin-bottom: 0;">에필로그 둘이에요.</p></section>
      <div class="app-course-box" style="margin: 40px 0 24px;">
        <strong style="display: block;">🗺️ 이 코스 오늘 데이트에서 열기</strong>
        <p style="margin: 0;">시험 코스를 앱에서 열어요.</p>
        <a href="${COURSE}" style="display: inline-block;">앱에서 코스 열기 →</a>
      </div>
    </article>
  </main>
  <footer class="site-footer"><div>본 글은 시험용 안내입니다.</div><div class="source-credit">사진 출처: 시험</div></footer>
</body>
</html>
`;
  const bout = convert(block);
  assert.deepStrictEqual(compare(block, bout), [], 'spot-block 계열이 보존 비교를 통과하지 못했다');
  assert.ok(bout.includes('<header class="site-header">') && bout.includes('<span class="header-note">시험 1박 2일 편</span>') && bout.includes('<p class="hero-quote">') && bout.includes('<figure class="hero-figure">'), 'spot-block 계열의 머리가 새 틀이 아니다');
  assert.strictEqual((bout.match(/<div class="route" /g) ?? []).length, 2, 'spot-block 계열의 동선은 날마다 route 하나여야 한다');
  assert.ok(bout.includes('<section class="story-section">') && bout.includes('<figure class="story-photo">') && bout.includes('<p class="drive-bridge">차로 10분 거리로 이동해요.</p>') && bout.includes('<div class="table-wrap amount-last">') && bout.includes('<ul class="map-list">') && /<a class="btn" href="[^"]*#c=/.test(bout), 'spot-block 계열의 장소 구획이나 경비표나 지도 목록이 새 틀이 아니다');
  assert.throws(() => convert(block.replace('<p class="spot-text">둘째 곳 설명이에요.</p>', '<blockquote>모름</blockquote>')), /모르는 요소/, 'spot-block 계열에서 모르는 요소가 있는데 변환이 실패하지 않았다');

  // timeline-list 계열(한남·이태원, 목포, 남해): ul.timeline-list 동선, article.spot-section 안 spot-card, 지도 칩, 경비표 합계 행, author-card 출처
  const tlist = `${head}<body>
  <header class="site-header"><div class="header-inner"><a href="/oneul-date/blog/" class="header-logo">오늘 데이트 <span>매거진</span></a></div></header>
  <main class="article-container">
    <header class="article-header">
      <span class="badge">시험 코스</span>
      <h1>[시험] 한 줄 동선</h1>
      <div class="meta-bar"><span>발행일: 2026. 10. 21</span><span>글: 시험 팀 / 사진: 시험</span></div>
      <p class="lead-text">도입 한 문단이에요.</p>
    </header>
    <section class="timeline-card">
      <div class="timeline-title"><span>🗺️</span> 시험 타임라인</div>
      <ul class="timeline-list"><li class="timeline-item"><span class="timeline-time">10:30 ~ 12:00</span><strong>[스팟 1] 첫째 곳</strong> (산책)</li></ul>
    </section>
    <article class="spot-section">
      <div class="spot-card">
        <div class="spot-image-wrap"><img src="https://example.com/a.jpg" alt="첫째 곳" loading="lazy"><div class="spot-image-caption">첫째 곳 사진 설명</div></div>
        <div class="spot-body">
          <div class="spot-header-row"><div><span class="spot-num">Spot 01</span><h2 class="spot-name">첫째 곳</h2></div></div>
          <div class="spot-chips"><a href="https://map.naver.com/p/search/a" class="spot-chip map-link" target="_blank" rel="noopener">네이버 지도 바로가기</a><a href="https://m.taxi.kakao.com/" class="spot-chip" target="_blank" rel="noopener">🚕 카카오T 호출</a></div>
          <p class="spot-desc" style="margin-top: 16px;">첫째 곳 설명이에요.</p>
          <div class="tip-box"><strong>💡 에디터 팁</strong>• 일찍 가요.<br>• 걸어요.</div>
        </div>
      </div>
    </article>
    <h2 class="spot-name" style="margin-top: 48px;">💰 시험 2인 예상 경비표</h2>
    <div class="table-wrap"><table><thead><tr><th>구분</th><th>장소</th><th>2인 금액</th><th>비고</th></tr></thead><tbody><tr><td>전시</td><td>첫째 곳</td><td>0원</td><td>무료</td></tr><tr class="sum-row"><td colspan="2"><strong>2인 합계</strong></td><td><strong>0원</strong></td><td>식사 별도</td></tr></tbody></table></div>
    <div class="app-course-box" style="margin: 40px 0 24px;"><strong style="display: block;">🗺️ 이 코스 오늘 데이트에서 열기</strong><p style="margin: 0;">앱에서 열어요.</p><a href="${COURSE}" style="display: inline-block;">앱에서 코스 열기 →</a></div>
    <footer class="article-footer"><div class="author-card"><div class="author-avatar">오늘</div><div class="author-info"><strong>시험 팀</strong><span>시험 설명</span></div></div><p style="margin-bottom: 8px;">출처 안내예요.</p><p>변경 안내예요.</p></footer>
  </main>
</body>
</html>`;
  const tout = convert(tlist);
  assert.deepStrictEqual(compare(tlist, tout), [], 'timeline-list 계열이 보존 비교를 통과하지 못했다');
  assert.ok(tout.includes('<div class="route range" style="--n:1">') && tout.includes('<p class="timeline-title">시험 타임라인</p>') && /<section class="spot-section no-photo|<section class="spot-section">\s*<figure class="spot-photo spot-image-wrap">/.test(tout), 'timeline-list 계열의 동선이나 장소 구획이 새 틀이 아니다');
  assert.ok(tout.includes('<div class="map-btn-wrap spot-actions"><a href="https://map.naver.com/p/search/a" target="_blank" rel="noopener" class="btn-naver-map link-quiet">네이버 지도 바로가기</a>') && tout.includes('<strong class="tip-title">에디터 팁</strong>'), 'timeline-list 계열의 지도 칩이나 팁 상자가 새 틀이 아니다');
  assert.ok(tout.includes('<tr class="cost-total-row">') && tout.includes('<table class="cost-table">') && tout.includes('<h2 class="timeline-title long">시험 2인 예상 경비표</h2>') && tout.includes('<footer class="article-credit">') && tout.includes('class="credit-mark" aria-hidden="true">오늘</span>') && /<a class="btn" href="[^"]*#c=/.test(tout), 'timeline-list 계열의 경비표나 출처나 앱 버튼이 새 틀이 아니다');
  assert.throws(() => convert(tlist.replace('<p class="spot-desc" style="margin-top: 16px;">', '<blockquote>모름</blockquote><p class="spot-desc">')), /모르는 요소/, 'timeline-list 계열에서 모르는 요소가 있는데 변환이 실패하지 않았다');

  // real-photo-flat의 머리 변형(부여, 속초): header.article-header + div.hero-img-wrap + 평문 도입 <p>, app-cta-banner, th 두 칸 합계 행, 지도 버튼 둘(&nbsp;)
  const flatHero = flat
    .replace('<header class="travel-header-bar"><div class="header-inner"><div class="header-title"><a href="../">← 📖 오늘 데이트 매거진</a></div></div></header>', '<header class="top-nav"><div class="nav-inner"><a href="../" class="nav-logo">📖 오늘 데이트 <span>매거진</span></a></div></header>')
    .replace(/<span class="post-badge">[\s\S]*?<div class="lead-box">[\s\S]*?<\/div>\s*<div class="real-photo-card"><img src="https:\/\/example.com\/lead.jpg"[\s\S]*?<\/div><\/div>/, `<header class="article-header"><div class="badge-wrap"><span class="badge">시험</span><span class="badge">평면</span></div><h1 class="article-title">[시험] 평면 글</h1><div class="article-meta">글: 오늘 데이트 에디토리얼 팀 / 사진: 카카오맵 포토 리뷰</div></header>
    <div class="hero-img-wrap"><img src="https://example.com/lead.jpg" alt="대표" class="hero-img"><div class="hero-caption">대표 사진 (출처: 시험)</div></div>
    <p>평문 도입이에요.</p>`)
    .replace('<tr style="font-weight: 700;"><td colspan="2">합계</td><td style="color: red;">0원</td><td></td></tr>', '<tr><th colspan="2" style="background:#eee;">합계</th><th colspan="2" style="color: red;">약 0원</th></tr>')
    .replace('<a href="https://map.naver.com/p/search/a" class="map-btn" target="_blank" rel="noopener noreferrer">🧭 지도 보기</a>', '<a href="https://map.naver.com/p/search/a" class="map-btn" target="_blank" rel="noopener noreferrer">🧭 지도 보기</a>\n   &nbsp;\n   <a href="https://map.naver.com/p/search/b" class="map-btn" target="_blank" rel="noopener noreferrer">🧭 둘째 지도</a>')
    .replace('<div class="app-course-box"', '<div class="app-cta-banner"><h3>앱이 궁금하다면?</h3><p>앱을 열어 보세요.</p><a href="../../" class="app-cta-btn">앱 열기 ↗</a></div>\n    <div class="app-course-box"');
  const fhout = convert(flatHero);
  assert.deepStrictEqual(compare(flatHero, fhout), [], 'flat 머리 변형이 보존 비교를 통과하지 못했다');
  assert.ok(fhout.includes('<span>시험</span><span>평면</span>') && fhout.includes('<span class="meta-credit">글: 오늘 데이트 에디토리얼 팀 / 사진: 카카오맵 포토 리뷰</span>') && fhout.indexOf('<figure class="lead-photo">') < fhout.indexOf('<div class="prose-intro">평문 도입이에요.</div>'), 'flat 머리 변형의 머리나 대표 사진 순서가 새 틀이 아니다');
  assert.ok(fhout.includes('<tr class="cost-total-row"><td colspan="2">합계</td><td colspan="2">약 0원</td></tr>'), 'flat 머리 변형의 합계 행이 새 틀이 아니다');
  assert.ok(fhout.includes('</a>&nbsp;<a href="https://map.naver.com/p/search/b"') && fhout.includes('<div class="cta-card">') && fhout.includes('class="link-quiet">앱 열기</a>') && fhout.includes('<header class="site-header">') && !fhout.includes('top-nav'), 'flat 머리 변형의 지도 버튼 둘이나 앱 소개 배너나 머리가 새 틀이 아니다');
  assert.ok(compare(flatHero, fhout.replace('대표 사진 (출처: 시험)', '다른 설명')).some((e) => /사진 설명/.test(e)), 'flat 머리 변형의 대표 사진 설명이 달라졌는데 compare가 잡지 못했다');

  // itinerary-spots 계열(군산)과 course-list 계열(서울·경기 20선): 둘 다 main.article-wrap 아래 평면 구조라 머리·푸터까지 모듈이 읽는다
  const wrapHead = (title) => `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="description" content="시험 글">
  <link rel="canonical" href="https://nufunc.github.io/oneul-date/blog/test/">
  <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
  <script type="application/ld+json">
{"@context":"https://schema.org","@type":"BlogPosting","headline":"${title}"}
  </script>
  <style>body { background: #fff; }</style>
</head>
<body>`;
  const itin = `${wrapHead('[시험] 일정 글')}
  <header class="blog-header">
    <div class="header-inner">
      <a href="../" class="blog-brand" style="text-decoration:none;"><span class="blog-title-text">← 📖 오늘 데이트 매거진</span><span class="blog-sub-text">시험 편</span></a>
      <a href="#naver-map-section" class="header-share-btn">🗺️ 지도 바로가기</a>
    </div>
  </header>
  <main class="article-wrap">
    <span class="post-category-tag">시험 당일치기 코스</span>
    <h1 class="post-title">[시험] 일정 글</h1>
    <p class="post-subtitle">부제예요.</p>
    <div class="post-meta-row"><div class="author-profile"><div class="author-avatar">🚗</div><span>글: 시험 팀</span></div><span>·</span><span>사진: 한국관광공사 TourAPI, 카카오맵</span><span>·</span><span>2026. 10. 05.</span></div>
    <div class="post-lead"><strong>"첫 줄이에요."</strong><br>도입 문단이에요.</div>
    <div class="itinerary-card">
      <div class="itinerary-title"><span>🧭</span><span>시험 동선</span></div>
      <div class="itinerary-section-title">🌅 오전 1막: 첫 막</div>
      <ul class="itinerary-list"><li><span class="time">10:30</span><span><strong>첫째 곳</strong> : 설명 하나</span></li></ul>
      <div class="itinerary-section-title" style="color:#000;">🌊 오후 2막: 둘째 막</div>
      <ul class="itinerary-list"><li><span class="time" style="color:#000;">14:00</span><span><strong>둘째 곳</strong> : 설명 둘</span></li></ul>
    </div>
    <p class="spot-desc">영업시간은 바뀔 수 있어요.</p>
    <div class="youtube-embed-card"><div class="video-header"><span>🎬 참고 영상</span><span style="font-size:12px;">유튜브 '시험'</span></div><div class="video-iframe-wrap"><iframe src="https://www.youtube.com/embed/abc" title="시험 영상" allowfullscreen></iframe></div><div class="video-caption">영상 설명 <a href="https://www.youtube.com/watch?v=abc" target="_blank" rel="noopener">원본</a></div></div>
    <section class="spot-section">
      <span class="spot-badge">SPOT 01 · 10:30 AM</span>
      <h2 class="spot-heading">첫째 곳 제목</h2>
      <p class="spot-desc">첫째 곳 앞 문단이에요.</p>
      <div class="article-photo"><img src="https://example.com/a.jpg" alt="첫째" loading="lazy"><div class="photo-caption">첫째 사진 (사진 출처: 시험)</div></div>
      <div class="tip-box"><div class="tip-box-title">💡 첫째 곳 팁</div><ul><li><strong>주차:</strong> 공영주차장이에요.</li></ul></div>
    </section>
    <div class="transition-bridge" style="background:#eee;"><div class="bridge-icon">🚗</div><div><strong>차량 7분:</strong> 둘째 곳으로 가요.</div></div>
    <section class="spot-section">
      <span class="spot-badge" style="background:#000;">SPOT 02 · 14:00</span>
      <h2 class="spot-heading">둘째 곳 제목</h2>
      <p class="spot-desc">둘째 곳 문단이에요.</p>
    </section>
    <section style="margin: 44px 0;">
      <h2 style="font-size: 20px;">💰 2인 예상 경비</h2>
      <p style="font-size: 14px;">경비 설명이에요.</p>
      <div class="table-container"><table class="expense-table"><thead><tr><th>구분</th><th>지출 항목</th><th>금액</th><th>비고</th></tr></thead><tbody>
        <tr><td><strong>식사</strong></td><td>첫째 곳</td><td>10,000원</td><td>점심</td></tr>
        <tr class="total-row"><td colspan="2"><strong>합계</strong></td><td><strong>10,000원</strong></td><td><strong>둘째 곳 제외</strong></td></tr>
      </tbody></table></div>
    </section>
    <section id="naver-map-section" class="map-action-card"><div class="map-action-title">🗺️ 지도 바로가기</div><div class="map-action-desc">지도 설명이에요.</div><div class="spot-links-grid"><a href="https://map.naver.com/p/search/a" target="_blank" rel="noopener" class="spot-link-chip">🍜 첫째 곳</a></div></section>
    <div class="tag-list"><span class="tag-item">#시험</span><span class="tag-item">#일정</span></div>
    <div class="app-course-box" style="margin: 40px 0;"><strong style="display:block;">🗺️ 이 코스 열기</strong><p style="margin:0;">코스를 앱에서 열어요.</p><a href="${COURSE}" style="padding:10px;">앱에서 코스 열기 →</a></div>
  </main>
  <footer class="blog-footer"><p>© 2026 오늘 데이트. All rights reserved.</p><p class="footer-license">사진 출처: 한국관광공사 TourAPI</p></footer>
</body>
</html>`;
  const itout = convert(itin);
  assert.deepStrictEqual(compare(itin, itout), [], 'itinerary-spots 계열이 보존 비교를 통과하지 못했다');
  assert.strictEqual((itout.match(/<div class="route" /g) ?? []).length, 2, 'itinerary-spots 계열의 동선은 막마다 route 하나여야 한다');
  assert.ok(itout.includes('<p class="tl-total">영업시간은 바뀔 수 있어요.</p>') && itout.includes('<span class="spot-num">SPOT 01</span><span>10:30 AM</span>') && itout.includes('<p class="drive-bridge"><strong>차량 7분:</strong> 둘째 곳으로 가요.</p>') && itout.includes('<figure class="story-photo">'), 'itinerary-spots 계열의 안내 문단이나 장소 구획이 새 틀이 아니다');
  assert.ok(itout.includes('<section class="video-card">') && itout.includes('<div class="video-frame"><iframe ') && itout.includes('<tr class="cost-total-row">') && itout.includes('<p class="tag-list"><span>#시험</span>') && itout.includes('<ul class="map-list">') && /<a class="btn" href="[^"]*#c=/.test(itout), 'itinerary-spots 계열의 영상, 경비표, 태그, 지도 목록, 앱 버튼이 새 틀이 아니다');
  assert.ok(itout.includes('<span class="header-note">시험 편</span>') && itout.includes('<p class="footer-line">사진 출처: 한국관광공사 TourAPI</p>') && !itout.includes('blog-footer'), 'itinerary-spots 계열의 머리나 푸터(사진 출처 줄)가 새 틀이 아니다');
  assert.throws(() => convert(itin.replace('<p class="spot-desc">둘째 곳 문단이에요.</p>', '<blockquote>모름</blockquote>')), /모르는 요소/, 'itinerary-spots 계열에서 모르는 요소가 있는데 변환이 실패하지 않았다');

  const stop = (name, hop) => `<li class="spot-item"><div class="spot-head"><strong>${name}</strong> <span class="spot-cat">카페</span></div><div class="spot-addr">서울 시험로 1</div><p class="spot-desc">${name} 설명이에요.</p><div class="spot-foot">${hop ? `<span class="spot-hop">${hop}</span>` : ''}<a href="https://map.naver.com/p/search/${name}" target="_blank" rel="noopener noreferrer" class="spot-map">지도 보기 ↗</a></div></li>`;
  const course = (n, a, b) => `<section class="course" id="course-${n}"><h2>${n}. ${a}</h2><span class="course-mood">분위기 ${n}</span><p>코스 ${n} 설명이에요.</p><div class="real-photo-card"><img src="https://example.com/c${n}.jpg" alt="사진 ${n}" loading="lazy" /><div class="photo-caption">사진 ${n} (사진 출처: 카카오맵)</div></div><ol class="spot-list">${stop(a + '1')}${stop(b + '2', '앞 장소에서 직선 약 50m')}</ol><a href="#toc" class="back-toc">↑ 목차로</a></section>`;
  const clist = `${wrapHead('[시험] 코스 모음')}
  <header class="travel-header-bar"><div class="header-inner"><div class="header-title"><a href="../" style="text-decoration:none;">← 📖 오늘 데이트 매거진</a></div><div class="header-meta">시험 모음 편</div></div></header>
  <main class="article-wrap">
    <span class="post-badge">동네별 코스 모음</span>
    <h1>[시험] 코스 모음</h1>
    <div class="post-sub-meta"><span>작성일: 2026. 10.</span><span>•</span><span>코스 2개, 장소 4곳</span></div>
    <div class="lead-box"><strong>"어느 동네로 갈까?"</strong><br>도입 문단이에요.</div>
    <nav class="toc-box" id="toc"><strong>🧭 코스 2개 바로가기</strong><ol><li><a href="#course-1">1. 가동</a> <span class="toc-mood">분위기 1</span></li><li><a href="#course-2">2. 나동</a> <span class="toc-mood">분위기 2</span></li></ol></nav>
    ${course(1, '가동', '가')}
    ${course(2, '나동', '나')}
    <h2>💌 코스를 고를 때</h2>
    <p>맺음 문단이에요.</p>
    <p>앱은 <a href="../../" style="color: red;">오늘 데이트 앱</a>에서 봐요.</p>
    <div class="footer-source">사진 출처: 시험<br>본 글은 시험용이에요.</div>
  </main>
</body>
</html>`;
  const clout = convert(clist);
  assert.deepStrictEqual(compare(clist, clout), [], 'course-list 계열이 보존 비교를 통과하지 못했다');
  assert.ok(clout.includes('<nav class="map-links toc" id="toc">') && clout.includes('<li><a href="#course-1">1. 가동</a><span class="toc-mood">분위기 1</span></li>') && clout.includes('<section class="spot-section flat course flip" id="course-2">') && clout.includes('<figure class="spot-photo spot-image-wrap">'), 'course-list 계열의 목차나 코스 구획이 새 틀이 아니다');
  assert.ok(clout.includes('<p class="stop-foot"><span class="stop-hop">앞 장소에서 직선 약 50m</span><a href="https://map.naver.com/p/search/나2" target="_blank" rel="noopener noreferrer" class="link-quiet">지도 보기</a></p>') && clout.includes('<a href="#toc" class="back-toc link-quiet">↑ 목차로</a>'), 'course-list 계열의 장소 목록이나 목차 돌아가기가 새 틀이 아니다');
  assert.ok(clout.includes('<header class="site-header">') && clout.includes('<span class="header-note">시험 모음 편</span>') && clout.includes('<footer class="site-footer">') && !/#c=/.test(clout), 'course-list 계열의 머리나 푸터가 새 틀이 아니거나 없던 코스 링크가 생겼다');
  assert.throws(() => convert(clist.replace('<span class="course-mood">분위기 2</span>', '<blockquote>모름</blockquote>')), /course-mood/, 'course-list 계열에서 틀이 어긋났는데 변환이 실패하지 않았다');

  const jday = (n, extra) => `<h2 class="spot-heading"><span class="day-badge">Day ${n}</span> ${n}. 시험 곳 ${n}</h2>
      <p class="spot-desc">시험 곳 ${n} 설명이에요.</p>${extra}
      <div class="info-grid"><div class="info-item"><span class="info-label">주소</span><span class="info-val">제주 시험로 ${n}</span></div></div>
      <div class="tip-box"><div class="tip-title">💡 에디토리얼 팁</div>팁 ${n}이에요.</div>
      <div class="map-btn-wrap"><a href="https://map.naver.com/p/search/${n}" target="_blank" rel="noopener noreferrer" class="map-btn"><span>네이버 지도에서 ${n} 확인하기</span></a></div>`;
  const jeju = `${wrapHead('[시험] 제주 글')}
  <header class="nav-header"><div class="nav-inner"><a href="/oneul-date/blog/" class="brand-logo"><span>오늘 데이트 매거진</span></a><a href="/oneul-date/blog/" class="nav-back">← 매거진 목록으로</a></div></header>
  <main class="post-container">
    <article>
      <div class="post-header"><span class="post-category">제주 시리즈 · 시험권</span><h1 class="post-title">[시험] 제주 글</h1><div class="post-meta"><span>작성일: 2026. 10. 16</span><span class="divider">/</span><span>글: 시험 팀</span></div></div>
      <div class="intro-box"><p>도입 하나예요.</p><p>도입 둘이에요.</p></div>
      <div class="route-summary"><h3>🧭 시험 동선</h3><div class="route-days"><div class="route-day-item"><div class="route-day-title">1일차 : 공항 → 시험 곳 1</div><div class="route-stat">첫날 이동 설명이에요.</div></div><div class="route-day-item"><div class="route-day-title">2일차 : 시험 곳 2</div><div class="route-stat">둘째 날 설명이에요.</div></div></div></div>
      ${jday(1, '\n      <div class="photo-card"><img src="https://example.com/j1.jpg" alt="제주 사진" loading="lazy"><div class="photo-caption"><span>사진 설명</span><span>출처: 시험</span></div></div>')}
      ${jday(2, '')}
      <h2>💰 시험 경비표</h2>
      <div class="table-wrap"><table><thead><tr><th>구분</th><th>항목</th><th>비용</th><th>비고</th></tr></thead><tbody><tr><td data-label="구분">입장료</td><td data-label="항목">시험 곳</td><td data-label="비용">1,000원</td><td data-label="비고">2인</td></tr><tr class="total-row"><td data-label="구분">합계</td><td data-label="항목">총</td><td data-label="비용">1,000원</td><td data-label="비고">제외</td></tr></tbody></table></div>
      <div class="map-collection"><h3>📍 지도 바로가기</h3><ul class="map-list"><li class="map-list-item"><a href="https://map.naver.com/p/search/1" target="_blank" rel="noopener noreferrer"><span>1. 시험 곳 1</span><span>지도 열기 ↗</span></a></li></ul></div>
      <div class="app-course-box" style="margin: 40px 0;"><strong style="display:block;">🗺️ 이 코스 열기</strong><p style="margin:0;">코스를 앱에서 열어요.</p><a href="${COURSE}" style="padding:10px;">앱에서 코스 열기 →</a></div>
      <footer class="post-footer"><div class="editorial-badge">시험 팀 큐레이션</div><p>안내 문단이에요.</p><p style="margin-top: 8px;">맺음 문단이에요.</p></footer>
    </article>
  </main>
</body>
</html>`;
  const jout = convert(jeju);
  assert.deepStrictEqual(compare(jeju, jout), [], 'jeju-days 계열이 보존 비교를 통과하지 못했다');
  assert.ok(jout.includes('<div class="tl-act" style="--r:1; --c:2">2일차</div>') && jout.includes('<h2 class="timeline-title">시험 동선</h2>') && jout.includes('<h2 class="spot-title"><span class="day-badge">Day 1</span> 1. 시험 곳 1</h2>') && jout.includes('<figure class="story-photo">'), 'jeju-days 계열의 동선이나 장소 구획이 새 틀이 아니다');
  assert.ok(jout.includes('<tr class="cost-total-row">') && jout.includes('<section class="map-links">') && jout.includes('<footer class="article-credit">') && jout.includes('<header class="site-header">') && !jout.includes('nav-header') && !jout.includes('class="divider"'), 'jeju-days 계열의 경비표, 지도 목록, 푸터, 머리 바가 새 틀이 아니다');
  assert.throws(() => convert(jeju.replace('<p class="spot-desc">시험 곳 2 설명이에요.</p>', '<blockquote>모름</blockquote>')), /모르는 요소/, 'jeju-days 계열에서 모르는 요소가 있는데 변환이 실패하지 않았다');

  // 포항 틀: main 안 article, 제목이 h2인 동선 상자, 동선 뒤의 도입 문단, 링크 둘인 지도 버튼, 문단 둘인 맺음 상자, 맺음의 앱 소개 배너
  const poh = (extraMap) => `${wrapHead('[시험] 포항 글')}
  <header class="site-header"><div class="header-inner"><a href="../" class="header-logo">오늘 데이트 <span>매거진</span></a></div></header>
  <main class="article-container">
    <article>
      <header class="article-header"><span class="badge">경북 포항 · 시험</span><h1>[시험] 포항 글</h1><div class="meta-info"><span>작성일: 2026-10-16</span><span>글: 시험 팀</span></div></header>
      <section class="summary-card"><h2 class="summary-title" style="margin-top:0;"><svg width="20" height="20"><circle cx="12" cy="12" r="10"></circle></svg>
        시험 동선 요약</h2><div class="route-steps">
        <div class="route-step-item"><div class="step-num">1</div><div class="step-text"><strong>오전 09:30 · 첫째 곳</strong><div class="step-note">첫째 설명이에요.</div></div></div>
        <div class="route-step-item"><div class="step-num">2</div><div class="step-text"><strong>오후 13:15 · 둘째 곳</strong><div class="step-note">둘째 설명이에요.</div></div></div>
      </div></section>
      <p>동선 뒤 도입이에요.</p>
      <h2>1. 첫째 곳 제목</h2>
      <p>첫째 문단이에요.</p>
      <div class="real-photo-card"><img src="https://example.com/p1.jpg" alt="포항 사진" loading="lazy"><div class="photo-caption"><span>설명</span></div></div>
      <div class="info-grid"><div class="info-item"><span class="info-label">주소</span><span class="info-val">포항 시험로</span></div></div>
      <div class="tip-box"><div class="tip-title">에디터 꿀팁: 시험</div>팁이에요.</div>
      <div class="map-btn-wrap" style="display:flex;"><a href="https://map.naver.com/p/search/a" target="_blank" rel="noopener noreferrer" class="map-btn"><svg width="16" height="16"><path d="M1 1"></path></svg>첫째 길찾기</a>${extraMap}</div>
      <h2>시험 예산</h2>
      <div class="table-wrap"><table><thead><tr><th>구분</th><th>항목</th><th>금액</th><th>참고</th></tr></thead><tbody><tr><td>오전</td><td>첫째 곳</td><td>0원</td><td>무료</td></tr><tr style="background:#f8fafc; font-weight:700;"><td colspan="2">합계</td><td style="color:red;">0원</td><td>무료</td></tr></tbody></table></div>
      <section class="outro-card"><h3 class="outro-title">마치며</h3><p style="margin-bottom:10px;">맺음 하나예요.</p><p style="margin-bottom:0;">맺음 둘이에요.</p></section>
      <div class="app-link-card"><div class="app-link-title">앱 소개</div><div class="app-link-desc">앱 설명이에요.</div><a href="../../" class="app-link-btn">둘러보기</a></div>
      <div class="app-course-box" style="margin: 40px 0;"><strong style="display:block;">🗺️ 이 코스 열기</strong><p style="margin:0;">코스를 앱에서 열어요.</p><a href="${COURSE}" style="padding:10px;">앱에서 코스 열기 →</a></div>
      <footer class="article-footer"><p>안내예요.</p></footer>
    </article>
  </main>
</body>
</html>`;
  const pin = poh('<a href="https://map.naver.com/p/search/b" target="_blank" rel="noopener noreferrer" class="map-btn">둘째 길찾기</a>');
  const pout = convert(pin);
  assert.deepStrictEqual(compare(pin, pout), [], '포항 틀이 보존 비교를 통과하지 못했다');
  assert.ok(pout.includes('<main class="article-container"><article>') && pout.includes('<h2 class="timeline-title">시험 동선 요약</h2>') && pout.indexOf('class="timeline-card') < pout.indexOf('동선 뒤 도입이에요.') && pout.includes('<span class="tl-time">오전 09:30</span>'), '포항 틀의 article 감싸기, 동선 제목(h2), 동선 뒤 도입이 새 틀이 아니다');
  assert.strictEqual((pout.match(/class="btn-naver-map link-quiet"/g) ?? []).length, 2, '포항 틀의 지도 링크 둘이 모두 남아야 한다');
  assert.ok(pout.includes('<div class="cta-card">') && pout.includes('<p>맺음 둘이에요.</p>') && pout.includes('<div class="app-course-box">') && pout.includes('<tr class="cost-total-row">'), '포항 틀의 맺음 상자, 앱 소개 배너, 경비표 합계 행이 새 틀이 아니다');

  assert.strictEqual(snapshot(out).links.length, snapshot(original).links.length + 1, '링크 수는 첫 화면 앱 버튼 하나만 늘어야 한다');
  console.log(`test-blog-hallmark: 변환 보존 비교, 새 틀 약속, 달라진 변환본 ${cases.length}건, 모르는 틀 실패 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
