import { expect, test } from '@playwright/test';
import { createInitialState, createShoe } from '../../src/game/blackjack/engine';
import { DEFAULT_SETTINGS } from '../../src/services/storage';
import type { Rank } from '../../src/game/blackjack/types';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
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

test('HIT 확률 변화와 회고가 새로고침·정산 후에도 유지된다', async ({ page }) => {
  const pool = createShoe();
  const first = (['5', '6', '7', '10', '4', '5'] as Rank[]).map((rank) => pool.splice(pool.findIndex((card) => card.rank === rank), 1)[0]);
  const snapshot = { schemaVersion: 1, game: { ...createInitialState(), phase: 'BETTING', shoe: [...first, ...pool] }, settings: DEFAULT_SETTINGS, tutorialComplete: true, tutorialStep: 0 };
  await page.evaluate((saved) => localStorage.setItem('table21.snapshot.v1', JSON.stringify(saved)), snapshot);
  await page.reload();
  await page.getByRole('button', { name: '이어하기' }).click();
  await page.getByRole('button', { name: /베팅 확정/ }).click();
  const analysis = page.getByRole('complementary', { name: '확률 분석' });
  const review = page.getByRole('region', { name: '라운드 회고', exact: true });
  const before = await analysis.getByLabel('다음 히트 버스트 확률').textContent();
  await page.getByRole('button', { name: /^HIT/ }).click();
  await expect(review.getByText('12점', { exact: true })).toBeVisible();
  await expect(review.getByText('16점', { exact: true })).toBeVisible();
  await expect(analysis.getByLabel('다음 히트 버스트 확률')).not.toHaveText(before!);
  const after = await analysis.getByLabel('다음 히트 버스트 확률').textContent();
  await page.screenshot({ path: 'output/playwright/learning-1280.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: '이어하기' }).click();
  await expect(review.getByText('1회 선택 기록')).toBeVisible();
  await expect(analysis.getByLabel('다음 히트 버스트 확률')).toHaveText(after!);
  await page.getByRole('button', { name: /^STAND/ }).click();
  await expect(review.getByRole('rowheader', { name: 'STAND', exact: true })).toBeVisible();
  await expect(review.getByText('2회 선택 기록')).toBeVisible();
  await page.screenshot({ path: 'output/playwright/review-1280.png', fullPage: true });
  await page.getByRole('button', { name: '다음 라운드' }).click();
  await expect(review.getByText('0회 선택 기록')).toBeVisible();
  await expect(review.getByRole('table')).toHaveCount(0);
});

test('모바일에서 회고와 분석창이 화면 너비 안에 배치된다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '자유 플레이' }).first().click();
  await page.getByRole('button', { name: '건너뛰기' }).click();
  const review = await page.getByRole('region', { name: '라운드 회고', exact: true }).boundingBox();
  const analysis = await page.getByRole('complementary', { name: '확률 분석' }).boundingBox();
  expect(review).not.toBeNull();
  expect(analysis).not.toBeNull();
  expect(analysis!.y).toBeGreaterThanOrEqual(review!.y + review!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'output/playwright/mobile-390.png', fullPage: true });
});
