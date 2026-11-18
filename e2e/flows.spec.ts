import { test, expect } from '@playwright/test';
import { collectErrors, courseSpotNames, makeCourse, waitForCourse } from './helpers';

// 사용자가 누르는 순서대로 핵심 흐름을 본다(P-508). @smoke는 배포 직후와 매일 라이브 점검에서 도는 것이다

test('a. 첫 방문에서 지역을 골라 코스를 만든다 @smoke', async ({ page }) => {
  const errors = collectErrors(page);
  const spots = page.waitForResponse((r) => /\/data\/spots\/[^/]+\.cols\.json/.test(r.url()) && r.ok());
  await page.goto('./');
  await spots;
  await page.getByRole('button', { name: '제주 스팟 보기' }).click();
  await makeCourse(page, '제주');
  expect(errors).toEqual([]);
});

test('b. 지역 랜딩에서 첫 Tab이 본문 건너뛰기이고 서울 코스를 만든다', async ({ page }) => {
  await page.goto('seoul/evening/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '본문으로 건너뛰기' })).toBeFocused();
  await makeCourse(page, '서울');
});

test('c. 저장한 코스가 목록에 다른 이름으로 남고 다시 열면 같은 순서다', async ({ page }) => {
  await page.goto('./');
  const first = await makeCourse(page);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '저장됨, 저장한 코스 열기' })).toBeVisible();

  const second = await makeCourse(page);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '저장됨, 저장한 코스 열기' })).toBeVisible();

  await page.getByRole('button', { name: '저장한 코스', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '저장한 코스' });
  const items = panel.getByRole('listitem');
  await expect(items).toHaveCount(2);
  // 목록 항목 이름은 「날짜 · 코스 이름 + 장소 이름들」이다. 같은 동네에서 만든 두 코스는 코스 이름이 같을 수 있어(결과 파일 Important)
  // 항목 이름 전체가 달라 사용자가 둘을 구분할 수 있는지를 본다
  const labels = await items.evaluateAll((els) => els.map((e) => e.querySelector('button')?.getAttribute('aria-label') || e.querySelector('button')?.textContent?.trim() || ''));
  expect(new Set(labels).size, `저장 목록: ${labels.join(' / ')}`).toBe(2);
  const firstItem = first.reduce((loc, name) => loc.filter({ hasText: name }), items);
  await expect(firstItem).toHaveCount(1);

  await firstItem.getByRole('button').first().click();
  await expect.poll(() => courseSpotNames(page)).toEqual(first);
  expect(second).not.toEqual(first);
});

test('d. 링크 복사로 받은 코스를 새 브라우저에서 열고 저장한다 @smoke', async ({ page, context, browser, baseURL }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL!).origin });
  await page.goto('./');
  const sent = await makeCourse(page);
  await page.getByRole('main').getByRole('button', { name: /^링크 (복사|공유)$/ }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('#c=');
  const link = await page.evaluate(() => navigator.clipboard.readText());

  const receiver = await browser.newContext({ viewport: page.viewportSize(), serviceWorkers: 'block' });
  try {
    const other = await receiver.newPage();
    await other.goto(link);
    await expect.poll(() => courseSpotNames(other)).toEqual(sent);
    await other.getByRole('main').getByRole('button', { name: '저장', exact: true }).click();
    await other.getByRole('button', { name: '저장한 코스', exact: true }).click();
    const panel = other.getByRole('dialog', { name: '저장한 코스' });
    await expect(panel.getByRole('listitem')).toHaveCount(1);
    await expect(panel.getByRole('listitem')).toContainText(sent[0]);
  } finally {
    await receiver.close();
  }
});

test('e. 장소 데이터를 받지 못하면 안내가 보이고 다시 받으면 코스를 만든다', async ({ page }) => {
  await page.route('**/data/spots/**', (route) => route.abort());
  await page.goto('./');
  const notice = page.getByRole('region', { name: '장소 정보 안내' });
  await expect(notice).toContainText('장소 정보를 다 받지 못했어요');
  await page.unroute('**/data/spots/**');
  const spots = page.waitForResponse((r) => /\/data\/spots\/[^/]+\.cols\.json/.test(r.url()) && r.ok());
  await notice.getByRole('button', { name: '다시 받기' }).click();
  await spots;
  await expect(notice).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  const seoul = page.getByRole('button', { name: '서울 스팟 보기' });
  await seoul.click();
  await expect(seoul).toHaveAttribute('aria-pressed', 'true');
  await makeCourse(page, '서울');
});

test('f. 매거진 글의 코스 링크가 앱의 받은 코스 화면을 연다', async ({ page }) => {
  await page.goto('blog/anseong/');
  const link = page.getByRole('link', { name: /앱에서 코스 열기/ }).first();
  const ids = ((await link.getAttribute('href')) || '').split('#c=')[1]?.split('.') || [];
  expect(ids.length).toBeGreaterThanOrEqual(2);
  await link.click();
  await expect(page).toHaveURL(/#c=/);
  await expect(page.getByRole('heading', { name: '매거진 글에 나온 장소로 만든 코스예요' })).toBeVisible();
  await waitForCourse(page);
});
