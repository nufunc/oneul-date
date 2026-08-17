/**
 * 오늘 데이트 - 가벼운 네이티브 인피드 광고 모듈 (Google AdSense / PWA 수익화)
 */

export interface AdConfig {
  clientId?: string;
  slotId?: string;
  enabled: boolean;
}

export const adConfig: AdConfig = {
  clientId: import.meta.env.VITE_ADSENSE_CLIENT_ID || '',
  slotId: import.meta.env.VITE_ADSENSE_SLOT_ID || '',
  enabled: import.meta.env.VITE_ADSENSE_ENABLED === 'true',
};

/**
 * 코스 추천 카드 사이에 삽입되는 감성 에디토리얼 무드의 네이티브 인피드 광고 카드 HTML
 */
export function renderNativeInfeedAdCard(): string {
  // 실제 승인된 애드센스 ID가 설정된 경우
  if (adConfig.enabled && adConfig.clientId && adConfig.slotId) {
    return `
      <article class="step-card ad-card has-adsense">
        <div class="ad-badge-row">
          <span class="ad-sponsor-label">Sponsored</span>
        </div>
        <div class="ad-container">
          <ins class="adsbygoogle"
               style="display:block"
               data-ad-client="${adConfig.clientId}"
               data-ad-slot="${adConfig.slotId}"
               data-ad-format="fluid"
               data-ad-layout-key="-fb+5w+4e-db+86"></ins>
        </div>
      </article>
    `;
  }

  // 광고 ID가 아직 없거나 비활성화 상태일 때는 사용자 경험을 해치지 않는 미니멀 큐레이션 팁 카드 렌더링
  return `
    <article class="step-card ad-card ad-curation-tip">
      <div class="ad-badge-row">
        <span class="ad-tip-label">💡 데이트 큐레이션 TIP</span>
      </div>
      <div class="ad-tip-content">
        <p class="ad-tip-title">“웨이팅 없이 즐기는 낭만 데이트 팁”</p>
        <p class="ad-tip-desc">인기 핫플은 캐치테이블이나 네이버 플레이스 사전 예약을 활용하시면 대기 없이 더욱 여유롭게 코스를 즐기실 수 있어요.</p>
      </div>
    </article>
  `;
}

/**
 * 애드센스 스크립트 비동기 초기화
 */
export function initAdSense(): void {
  if (!adConfig.enabled || !adConfig.clientId) return;

  // 이미 로드되었는지 확인
  if (document.querySelector('script[src*="pagead2.googlesyndication.com"]')) {
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // ignore
    }
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adConfig.clientId}`;
  script.onload = () => {
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // ignore
    }
  };
  document.head.appendChild(script);
}
