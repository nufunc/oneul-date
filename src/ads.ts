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

  // 광고가 비활성 상태이면 아무것도 렌더링하지 않는다.
  // (자리만 채우던 고정 문구 '데이트 큐레이션 TIP' 카드는 매번 같은 내용인데다
  //  스텝 카드 사이에 끼어들어 타임라인 흐름을 끊어 제거 — 2026-08-18)
  return '';
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
