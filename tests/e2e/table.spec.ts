import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
});

test('로비에서 한 라운드를 시작하고 핵심 화면을 탐색한다', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
  await expect(page.getByRole('heading', { name: /당신의 판단으로/ })).toBeVisible();
  await page.getByRole('button', { name: '자유 플레이' }).first().click();
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await page.getByRole('spinbutton').fill('10');
  await page.getByRole('button', { name: /베팅 확정/ }).click();

  const insurance = page.getByRole('button', { name: '거절' });
  if (await insurance.isVisible().catch(() => false)) await insurance.click();
  const stand = page.getByRole('button', { name: /STAND/ });
  if (await stand.isVisible().catch(() => false)) await stand.click();

  await expect(page.getByText('TABLE 21 V1 STANDARD')).toBeVisible();
  await expect(page.getByRole('heading', { name: '딜러' })).toBeVisible();
  await expect(page.getByText('ROUND SETTLED')).toBeVisible();
  await page.screenshot({ path: 'output/playwright/round-1280x720.png', fullPage: false });
  await page.getByRole('button', { name: '통계', exact: true }).click();
  await expect(page.getByRole('heading', { name: '상세 통계' })).toBeVisible();
  await page.getByRole('button', { name: '게임 방법', exact: true }).click();
  await expect(page.getByRole('heading', { name: '게임 방법' })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('1280x720에서 핵심 테이블 UI가 겹치지 않는다', async ({ page }) => {
  await page.getByRole('button', { name: '자유 플레이' }).first().click();
  await page.getByRole('button', { name: '건너뛰기' }).click();
  const table = page.getByRole('region', { name: '블랙잭 테이블' }).or(page.getByLabel('블랙잭 테이블'));
  await expect(table).toBeVisible();
  const box = await table.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.width).toBeLessThanOrEqual(1280);
  await expect(page.getByRole('button', { name: /베팅 확정/ })).toBeVisible();
  await page.screenshot({ path: 'output/playwright/table-1280x720.png', fullPage: false });
});
