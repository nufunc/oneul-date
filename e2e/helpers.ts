import { expect, type Page } from '@playwright/test';

/** 화면에 보이는 코스의 장소 이름을 순서대로 낸다. 카드 제목(h3)이 장소 이름이다 */
export async function courseSpotNames(page: Page): Promise<string[]> {
  const names = await page.getByRole('main').getByRole('article').getByRole('heading', { level: 3 }).allTextContents();
  return names.map((n) => n.trim());
}

/** 코스 카드마다 붙은 주소 줄(📍 서울 중구)을 순서대로 낸다 */
export async function courseAddresses(page: Page): Promise<string[]> {
  const lines = await page.getByRole('main').getByRole('article').getByRole('paragraph').filter({ hasText: '📍' }).allTextContents();
  return lines.map((l) => l.replace('📍', '').trim());
}

/** 장소가 두 곳 이상인 코스가 그려질 때까지 기다린 뒤 장소 이름을 낸다 */
export async function waitForCourse(page: Page): Promise<string[]> {
  await expect.poll(async () => (await courseSpotNames(page)).length).toBeGreaterThanOrEqual(2);
  return courseSpotNames(page);
}

/**
 * 「완성하기」를 누르고 새 코스가 그려질 때까지 기다린다. 홈은 누르기 전부터 오늘의 코스를 보여 주고,
 * 「전국」으로 누르면 나머지 권역 파일을 받은 뒤에 그리므로 누르기 전 코스와 달라진 것을 새 코스로 본다.
 * region을 주면 모든 장소 주소가 그 지역으로 시작해야 한다
 */
export async function makeCourse(page: Page, region?: string): Promise<string[]> {
  // 첫 화면은 권역 파일이 오면 오늘의 코스를 다시 그린다. 그 전에 누르면 다시 그린 코스를 새 코스로 오인한다
  await page.waitForLoadState('networkidle');
  const before = await courseSpotNames(page);
  await page.getByRole('button', { name: /맞춤 데이트 코스 완성하기/ }).click();
  await expect.poll(async () => {
    const names = await courseSpotNames(page);
    const addresses = await courseAddresses(page);
    if (names.length < 2 || names.join('|') === before.join('|')) return `코스 그대로: ${names.join(', ')}`;
    if (region && !addresses.every((a) => a.startsWith(region))) return `${region} 밖 장소: ${addresses.join(', ')}`;
    return 'ok';
  }, { timeout: 30_000 }).toBe('ok');
  return courseSpotNames(page);
}

/** 페이지 오류와 콘솔 error를 모은다. 시험 끝에 비어 있어야 하는 시나리오에서 쓴다 */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()} @ ${m.location().url}`);
  });
  return errors;
}
