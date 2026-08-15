import './style.css';
import rawSpotsData from './data/spots.json';

interface Spot {
  id: number | string;
  name: string;
  filename: string;
  region: string;
  theme: string;
  location: string;
  category: string;
  price: string;
  mood: string;
  tags: string[];
  full_text: string;
}

const spots: Spot[] = rawSpotsData as unknown as Spot[];

// State
let activeTab: 'explore' | 'course' = 'explore';
let searchQuery = '';
let selectedRegion = 'ALL';
let selectedMood = 'ALL';
let selectedTrend = 'ALL';
let displayLimit = 24;
let wishlist: string[] = JSON.parse(localStorage.getItem('wishlist_spots') || '[]');

// DOM Elements Container
const app = document.getElementById('app')!;

function saveWishlist() {
  localStorage.setItem('wishlist_spots', JSON.stringify(wishlist));
  updateWishlistUI();
}

function showToast(msg: string) {
  let toast = document.querySelector('.toast-msg') as HTMLElement;
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// Region categorization helper
function matchesRegion(spot: Spot, region: string): boolean {
  if (region === 'ALL') return true;
  const loc = (spot.region + ' ' + spot.location + ' ' + spot.name + ' ' + spot.tags.join(' ')).toLowerCase();
  if (region === 'SEOUL') return loc.includes('서울') || loc.includes('강남') || loc.includes('성수') || loc.includes('한남') || loc.includes('종로') || loc.includes('용산') || loc.includes('송파');
  if (region === 'GYEONGGI') return loc.includes('경기') || loc.includes('인천') || loc.includes('가평') || loc.includes('양평') || loc.includes('포천') || loc.includes('파주') || loc.includes('수원') || loc.includes('용인') || loc.includes('화성') || loc.includes('강화');
  if (region === 'GANGWON') return loc.includes('강원') || loc.includes('평창') || loc.includes('강릉') || loc.includes('속초') || loc.includes('양양') || loc.includes('춘천') || loc.includes('정선') || loc.includes('영월') || loc.includes('홍천') || loc.includes('삼척') || loc.includes('고성');
  if (region === 'CHUNGCHEONG') return loc.includes('충남') || loc.includes('충북') || loc.includes('대전') || loc.includes('세종') || loc.includes('태안') || loc.includes('보령') || loc.includes('단양') || loc.includes('제천') || loc.includes('공주') || loc.includes('부여');
  if (region === 'GYEONGSANG') return loc.includes('경북') || loc.includes('경남') || loc.includes('부산') || loc.includes('대구') || loc.includes('울산') || loc.includes('경주') || loc.includes('포항') || loc.includes('거제') || loc.includes('통영') || loc.includes('남해') || loc.includes('안동') || loc.includes('울진');
  if (region === 'JEONLA') return loc.includes('전남') || loc.includes('전북') || loc.includes('광주') || loc.includes('여수') || loc.includes('순천') || loc.includes('담양') || loc.includes('전주') || loc.includes('남원') || loc.includes('구례') || loc.includes('고창') || loc.includes('신안');
  if (region === 'JEJU') return loc.includes('제주') || loc.includes('서귀포') || loc.includes('애월') || loc.includes('한림') || loc.includes('구좌') || loc.includes('조천') || loc.includes('중문');
  return true;
}

// Mood helper
function matchesMood(spot: Spot, mood: string): boolean {
  if (mood === 'ALL') return true;
  const full = (spot.tags.join(' ') + ' ' + spot.theme + ' ' + spot.mood + ' ' + spot.full_text).toLowerCase();
  if (mood === 'ROMANTIC') return full.includes('romantic') || full.includes('로맨틱') || full.includes('일몰') || full.includes('데이트') || full.includes('와인');
  if (mood === 'HEALING') return full.includes('healing') || full.includes('peaceful') || full.includes('힐링') || full.includes('자연') || full.includes('숲') || full.includes('쉼');
  if (mood === 'LUXURY') return full.includes('luxury') || full.includes('럭셔리') || full.includes('호텔') || full.includes('하이엔드') || full.includes('풀빌라') || full.includes('스위트');
  if (mood === 'GOURMET') return full.includes('food') || full.includes('gourmet') || full.includes('다이닝') || full.includes('오마카세') || full.includes('미식') || full.includes('노포') || full.includes('브루어리');
  return true;
}

// Trend helper
function matchesTrend(spot: Spot, trend: string): boolean {
  if (trend === 'ALL') return true;
  const full = (spot.filename + ' ' + spot.tags.join(' ') + ' ' + spot.full_text).toLowerCase();
  if (trend === 'YOUTUBE') return full.includes('youtube') || full.includes('유튜브') || full.includes('100만뷰') || full.includes('또간집') || full.includes('먹을텐데');
  if (trend === 'TREEHOUSE') return full.includes('treehouse') || full.includes('오두막') || full.includes('트리하우스') || full.includes('cabin');
  if (trend === 'SPA_POOL') return full.includes('spa') || full.includes('poolvilla') || full.includes('히노끼') || full.includes('인피니티') || full.includes('자쿠지') || full.includes('온천');
  if (trend === 'CAMPING') return full.includes('camping') || full.includes('차박') || full.includes('카라반') || full.includes('글램핑');
  return true;
}

// Filter logic
function getFilteredSpots(): Spot[] {
  return spots.filter((spot) => {
    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const searchable = (spot.name + ' ' + spot.location + ' ' + spot.mood + ' ' + spot.theme + ' ' + spot.tags.join(' ')).toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    // Region
    if (!matchesRegion(spot, selectedRegion)) return false;
    // Mood
    if (!matchesMood(spot, selectedMood)) return false;
    // Trend
    if (!matchesTrend(spot, selectedTrend)) return false;
    return true;
  });
}

function renderApp() {
  const filteredSpots = getFilteredSpots();
  const visibleSpots = filteredSpots.slice(0, displayLimit);

  app.innerHTML = `
    <!-- Header -->
    <header class="app-header">
      <div class="logo-wrap">
        <div class="logo-badge">✦ 2,000+ CURATED ARCHIVE</div>
        <h1 class="app-title">SECRET SPOT & COURSE</h1>
        <p class="app-subtitle">전국 하이엔드 프라이빗 독채 · 시크릿 다이닝 · 유튜브 100만뷰 핫스폿 큐레이션</p>
      </div>
      <div class="header-actions">
        <button class="btn-header" id="btn-wishlist-toggle">
          💖 위시리스트 <span class="wish-count-badge" id="wish-count">${wishlist.length}</span>
        </button>
        <button class="btn-header primary" id="btn-random-pick">
          🎲 오늘 어디 가지? (랜덤)
        </button>
      </div>
    </header>

    <!-- Main Navigation Tabs -->
    <div class="view-tabs">
      <button class="tab-btn ${activeTab === 'explore' ? 'active' : ''}" id="tab-explore">
        🔍 스폿 탐색 (${filteredSpots.length}선)
      </button>
      <button class="tab-btn ${activeTab === 'course' ? 'active' : ''}" id="tab-course">
        ⚡ 1초 AI 코스 빌더
      </button>
    </div>

    ${activeTab === 'explore' ? renderExploreView(filteredSpots, visibleSpots) : renderCourseView()}

    <!-- Wishlist Drawer Modal -->
    <div class="modal-overlay" id="wishlist-modal">
      <div class="wishlist-drawer">
        <div class="drawer-header">
          <h3 class="drawer-title">💖 내가 찜한 시크릿 스폿 (${wishlist.length})</h3>
          <button class="btn-close-drawer" id="btn-close-wishlist">✕</button>
        </div>
        <div class="wishlist-items-list" id="wishlist-items-container">
          ${renderWishlistItems()}
        </div>
      </div>
    </div>
  `;

  attachEventListeners();
}

function renderExploreView(filteredSpots: Spot[], visibleSpots: Spot[]) {
  return `
    <!-- 5D Filter Section -->
    <section class="filter-container">
      <div class="search-input-wrap">
        <span class="search-icon">🔍</span>
        <input 
          type="text" 
          id="search-box"
          class="search-input" 
          placeholder="가고 싶은 지역, 숙소명, 테마(오두막, 불멍, 자쿠지, 성시경 등)를 검색해보세요..."
          value="${escapeHtml(searchQuery)}"
        />
      </div>

      <div class="filter-group-row">
        <!-- Region -->
        <div class="filter-row">
          <span class="filter-label">권역</span>
          <div class="pill-group" id="filter-region">
            <button class="filter-pill ${selectedRegion === 'ALL' ? 'active' : ''}" data-val="ALL">전체</button>
            <button class="filter-pill ${selectedRegion === 'SEOUL' ? 'active' : ''}" data-val="SEOUL">서울</button>
            <button class="filter-pill ${selectedRegion === 'GYEONGGI' ? 'active' : ''}" data-val="GYEONGGI">경기/인천/수도권</button>
            <button class="filter-pill ${selectedRegion === 'GANGWON' ? 'active' : ''}" data-val="GANGWON">강원 고원/해안</button>
            <button class="filter-pill ${selectedRegion === 'CHUNGCHEONG' ? 'active' : ''}" data-val="CHUNGCHEONG">충청/서해안</button>
            <button class="filter-pill ${selectedRegion === 'GYEONGSANG' ? 'active' : ''}" data-val="GYEONGSANG">영남/부산/경주</button>
            <button class="filter-pill ${selectedRegion === 'JEONLA' ? 'active' : ''}" data-val="JEONLA">호남/지리산/여수</button>
            <button class="filter-pill ${selectedRegion === 'JEJU' ? 'active' : ''}" data-val="JEJU">제주도</button>
          </div>
        </div>

        <!-- Mood -->
        <div class="filter-row">
          <span class="filter-label">분위기</span>
          <div class="pill-group" id="filter-mood">
            <button class="filter-pill ${selectedMood === 'ALL' ? 'active' : ''}" data-val="ALL">전체</button>
            <button class="filter-pill ${selectedMood === 'ROMANTIC' ? 'active' : ''}" data-val="ROMANTIC">✨ 로맨틱 & 감성</button>
            <button class="filter-pill ${selectedMood === 'HEALING' ? 'active' : ''}" data-val="HEALING">🌲 피톤치드 힐링</button>
            <button class="filter-pill ${selectedMood === 'LUXURY' ? 'active' : ''}" data-val="LUXURY">👑 럭셔리 & 프라이빗</button>
            <button class="filter-pill ${selectedMood === 'GOURMET' ? 'active' : ''}" data-val="GOURMET">🍷 미식 & 오마카세</button>
          </div>
        </div>

        <!-- Trend / Theme -->
        <div class="filter-row">
          <span class="filter-label">트렌드</span>
          <div class="pill-group" id="filter-trend">
            <button class="filter-pill ${selectedTrend === 'ALL' ? 'active' : ''}" data-val="ALL">전체</button>
            <button class="filter-pill ${selectedTrend === 'YOUTUBE' ? 'active' : ''}" data-val="YOUTUBE">🎬 유튜브 100만뷰 픽</button>
            <button class="filter-pill ${selectedTrend === 'TREEHOUSE' ? 'active' : ''}" data-val="TREEHOUSE">🏡 숲속 오두막/트리하우스</button>
            <button class="filter-pill ${selectedTrend === 'SPA_POOL' ? 'active' : ''}" data-val="SPA_POOL">♨️ 히노끼 & 인피니티풀</button>
            <button class="filter-pill ${selectedTrend === 'CAMPING' ? 'active' : ''}" data-val="CAMPING">⛺ 감성 글램핑/차박</button>
          </div>
        </div>
      </div>
    </section>

    <!-- Results Status Bar -->
    <div class="results-bar">
      <div class="results-count">
        총 <strong>${filteredSpots.length}</strong>개의 프리미엄 스폿이 검색되었습니다.
      </div>
    </div>

    <!-- Spot Cards Grid -->
    <section class="spots-grid">
      ${visibleSpots.map((spot) => renderSpotCard(spot)).join('')}
    </section>

    ${filteredSpots.length > displayLimit ? `
      <div style="text-align: center; margin-top: 40px;">
        <button class="btn-generate-big" id="btn-load-more">
          더 많은 스폿 불러오기 (+24개)
        </button>
      </div>
    ` : ''}
  `;
}

function renderSpotCard(spot: Spot) {
  const spotId = String(spot.id);
  const isWished = wishlist.includes(spotId);
  const locationShort = spot.location || spot.region || '전국 프리미엄';
  const cleanName = spot.name.replace(/\[.*?\]\s*/g, '');
  const naverMapUrl = `https://map.naver.com/v5/search/${encodeURIComponent(cleanName + ' ' + locationShort)}`;

  return `
    <article class="spot-card" data-id="${spotId}">
      <div>
        <div class="card-top">
          <div class="spot-meta-badges">
            <span class="badge-location">📍 ${escapeHtml(locationShort.split(' ')[0] || '전국')}</span>
            ${spot.tags.some(t => t.includes('youtube')) ? '<span class="badge-trend">🎬 유튜브 픽</span>' : ''}
            ${spot.tags.some(t => t.includes('spa') || t.includes('hinoki')) ? '<span class="badge-location">♨️ 노천 스파</span>' : ''}
          </div>
          <button class="btn-wish ${isWished ? 'wished' : ''}" data-spot-id="${spotId}" title="위시리스트 저장">
            ${isWished ? '❤️' : '🤍'}
          </button>
        </div>

        <h3 class="spot-name">${escapeHtml(cleanName)}</h3>
        <p class="spot-location-text">📍 ${escapeHtml(locationShort)}</p>

        ${spot.theme ? `
          <div class="spot-feature-box">
            <div class="feature-title">✨ 테마 & 카테고리</div>
            <p class="feature-desc">${escapeHtml(spot.theme)} (${escapeHtml(spot.category)})</p>
          </div>
        ` : ''}

        ${spot.mood ? `
          <div class="spot-feature-box" style="background: rgba(229,169,60,0.06);">
            <div class="feature-title">🔥 킬링 포인트</div>
            <p class="feature-desc" style="color: #f5c76c;">${escapeHtml(spot.mood.substring(0, 140))}${spot.mood.length > 140 ? '...' : ''}</p>
          </div>
        ` : ''}
      </div>

      <div class="card-footer">
        <div class="price-tag">
          ${spot.price ? `<strong>${escapeHtml(spot.price.substring(0, 30))}</strong>` : '<span>예약제 운영</span>'}
        </div>
        <div class="card-actions">
          <a href="${naverMapUrl}" target="_blank" rel="noopener noreferrer" class="btn-action-map">
            네이버 지도 ↗
          </a>
        </div>
      </div>
    </article>
  `;
}

function renderCourseView() {
  return `
    <section class="course-generator-section">
      <div class="course-gen-header">
        <h2>⚡ 1초 AI 맞춤형 데이트 코스 빌더</h2>
        <p>선택하신 지역과 분위기에 딱 맞추어 [1단계 감성 카페/스폿 → 2단계 시크릿 다이닝 → 3단계 프라이빗 숙소] 환상의 3스텝 코스를 즉시 생성합니다.</p>
      </div>

      <div class="course-controls">
        <select class="control-select" id="course-region-select">
          <option value="ALL">전체 지역 어디든</option>
          <option value="SEOUL">서울 도심/시크릿</option>
          <option value="GYEONGGI">경기/인천 수도권 근교</option>
          <option value="GANGWON">강원 숲속 & 바다</option>
          <option value="CHUNGCHEONG">충청 서해 & 호수</option>
          <option value="GYEONGSANG">영남/부산/경주</option>
          <option value="JEONLA">호남/지리산/여수</option>
          <option value="JEJU">제주도</option>
        </select>

        <select class="control-select" id="course-mood-select">
          <option value="ALL">모든 분위기</option>
          <option value="ROMANTIC">✨ 로맨틱 & 감성 기념일</option>
          <option value="HEALING">🌲 오프그리드 숲속 힐링</option>
          <option value="LUXURY">👑 하이엔드 럭셔리 호캉스</option>
          <option value="GOURMET">🍷 미식 & 크리에이터 노포 투어</option>
        </select>

        <button class="btn-generate-big" id="btn-create-course">
          ✨ 맞춤 코스 생성하기
        </button>
      </div>

      <div id="course-result-container">
        <!-- Generated course will appear here -->
      </div>
    </section>
  `;
}

function generateAICourse(region: string, mood: string) {
  let pool = spots.filter(s => matchesRegion(s, region) && matchesMood(s, mood));
  if (pool.length < 3) pool = spots;

  // Pick 3 diverse spots
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  const step1 = shuffled[0];
  const step2 = shuffled[1] || shuffled[0];
  const step3 = shuffled[2] || shuffled[1];

  const container = document.getElementById('course-result-container');
  if (!container) return;

  const courseTitle = `${region === 'ALL' ? '대한민국 시크릿' : region} ${mood === 'ALL' ? '로맨틱 힐링' : mood} 추천 코스`;

  container.innerHTML = `
    <div class="generated-course-box">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="font-size: 1.3rem; font-weight: 800; color: var(--accent-gold);">
          🥂 ${courseTitle}
        </h3>
        <button class="btn-header primary" id="btn-copy-course">
          📋 코스 전체 복사
        </button>
      </div>

      <div class="course-timeline">
        <div class="timeline-step">
          <div class="timeline-dot"></div>
          <div class="step-label">STEP 1. 감성 프리뷰 & 티/커피 타임</div>
          <div class="step-title">${escapeHtml(step1.name)}</div>
          <p class="step-desc">📍 ${escapeHtml(step1.location)} — ${escapeHtml(step1.mood.substring(0, 100))}</p>
        </div>

        <div class="timeline-step">
          <div class="timeline-dot"></div>
          <div class="step-label">STEP 2. 시크릿 다이닝 & 이색 액티비티</div>
          <div class="step-title">${escapeHtml(step2.name)}</div>
          <p class="step-desc">📍 ${escapeHtml(step2.location)} — ${escapeHtml(step2.mood.substring(0, 100))}</p>
        </div>

        <div class="timeline-step">
          <div class="timeline-dot"></div>
          <div class="step-label">STEP 3. 프라이빗 독채 스파 / 야경 & 휴식</div>
          <div class="step-title">${escapeHtml(step3.name)}</div>
          <p class="step-desc">📍 ${escapeHtml(step3.location)} — ${escapeHtml(step3.mood.substring(0, 100))}</p>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-copy-course')?.addEventListener('click', () => {
    const text = `[✨ SECRET SPOT 데이트 코스 추천]\n\n1. ${step1.name} (${step1.location})\n2. ${step2.name} (${step2.location})\n3. ${step3.name} (${step3.location})\n\n자세히 보기: https://map.naver.com/v5/search/${encodeURIComponent(step1.name)}`;
    navigator.clipboard.writeText(text).then(() => showToast('📋 코스가 클립보드에 복사되었습니다!'));
  });
}

function renderWishlistItems() {
  if (wishlist.length === 0) {
    return `<div class="empty-state">아직 찜한 스폿이 없습니다.<br>스폿 카드의 하트(🤍)를 눌러 나만의 위시리스트를 완성하세요!</div>`;
  }
  const wishedSpots = spots.filter(s => wishlist.includes(String(s.id)));
  return wishedSpots.map(s => `
    <div class="wish-item-card">
      <div>
        <strong style="font-size: 0.95rem;">${escapeHtml(s.name.replace(/\[.*?\]\s*/g, ''))}</strong>
        <div style="font-size: 0.78rem; color: var(--text-secondary);">📍 ${escapeHtml(s.location)}</div>
      </div>
      <button class="btn-remove-wish" data-spot-id="${s.id}" style="color: var(--accent-rose); font-size: 0.9rem; padding: 4px 8px;">
        ✕ 삭제
      </button>
    </div>
  `).join('');
}

function updateWishlistUI() {
  const badge = document.getElementById('wish-count');
  if (badge) badge.textContent = wishlist.length.toString();

  const container = document.getElementById('wishlist-items-container');
  if (container) container.innerHTML = renderWishlistItems();

  document.querySelectorAll('.btn-wish').forEach(btn => {
    const id = btn.getAttribute('data-spot-id');
    if (id && wishlist.includes(id)) {
      btn.classList.add('wished');
      btn.textContent = '❤️';
    } else if (btn) {
      btn.classList.remove('wished');
      btn.textContent = '🤍';
    }
  });

  // Reattach remove listener
  document.querySelectorAll('.btn-remove-wish').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-spot-id');
      if (id) {
        wishlist = wishlist.filter(x => x !== id);
        saveWishlist();
        showToast('위시리스트에서 삭제되었습니다.');
      }
    });
  });
}

function attachEventListeners() {
  // Tabs
  document.getElementById('tab-explore')?.addEventListener('click', () => {
    activeTab = 'explore';
    renderApp();
  });
  document.getElementById('tab-course')?.addEventListener('click', () => {
    activeTab = 'course';
    renderApp();
  });

  // Search
  const searchBox = document.getElementById('search-box') as HTMLInputElement;
  if (searchBox) {
    searchBox.addEventListener('input', (e) => {
      searchQuery = (e.target as HTMLInputElement).value;
      displayLimit = 24;
      renderApp();
    });
  }

  // Filter Pills (Region)
  document.querySelectorAll('#filter-region .filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedRegion = btn.getAttribute('data-val') || 'ALL';
      displayLimit = 24;
      renderApp();
    });
  });

  // Filter Pills (Mood)
  document.querySelectorAll('#filter-mood .filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedMood = btn.getAttribute('data-val') || 'ALL';
      displayLimit = 24;
      renderApp();
    });
  });

  // Filter Pills (Trend)
  document.querySelectorAll('#filter-trend .filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedTrend = btn.getAttribute('data-val') || 'ALL';
      displayLimit = 24;
      renderApp();
    });
  });

  // Load More
  document.getElementById('btn-load-more')?.addEventListener('click', () => {
    displayLimit += 24;
    renderApp();
  });

  // Wishlist toggle button on cards
  document.querySelectorAll('.btn-wish').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-spot-id');
      if (!id) return;
      if (wishlist.includes(id)) {
        wishlist = wishlist.filter(x => x !== id);
        showToast('위시리스트에서 제외되었습니다.');
      } else {
        wishlist.push(id);
        showToast('💖 위시리스트에 저장되었습니다!');
      }
      saveWishlist();
    });
  });

  // Wishlist Modal open/close
  const modal = document.getElementById('wishlist-modal');
  document.getElementById('btn-wishlist-toggle')?.addEventListener('click', () => {
    modal?.classList.add('open');
  });
  document.getElementById('btn-close-wishlist')?.addEventListener('click', () => {
    modal?.classList.remove('open');
  });
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  // Random Pick
  document.getElementById('btn-random-pick')?.addEventListener('click', () => {
    const randomSpot = spots[Math.floor(Math.random() * spots.length)];
    searchQuery = randomSpot.name.replace(/\[.*?\]\s*/g, '');
    activeTab = 'explore';
    renderApp();
    showToast(`🎲 추천 스폿: ${randomSpot.name}`);
  });

  // AI Course Generator
  document.getElementById('btn-create-course')?.addEventListener('click', () => {
    const r = (document.getElementById('course-region-select') as HTMLSelectElement)?.value || 'ALL';
    const m = (document.getElementById('course-mood-select') as HTMLSelectElement)?.value || 'ALL';
    generateAICourse(r, m);
  });

  updateWishlistUI();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initial Launch
renderApp();
