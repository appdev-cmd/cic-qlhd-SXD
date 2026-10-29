import { expect, test } from '@playwright/test';

test('deployed static demo displays all twelve actual BIM models without an API', async ({ page }) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/appraisal/**', (route) =>
    route.fulfill({ status: 404, contentType: 'text/plain', body: 'No backend' }),
  );
  await page.goto('/bim');
  await expect(page.getByText('Mô hình BIM NOXH HVT', { exact: true }).first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('tab', { name: 'Không gian mô hình', exact: true })).toBeVisible();
  const viewer = page.locator('[data-bim-loaded-count]');
  await expect(viewer).toHaveAttribute('data-bim-loaded-count', '12', { timeout: 240000 });
  await expect(viewer).toHaveAttribute('data-bim-loading-count', '0');
  await expect(viewer).toHaveAttribute('data-bim-failed-count', '0');
  await expect(page.getByText('38.739 CK', { exact: false })).toBeVisible();
  await page.screenshot({ path: '../../output/appraisal/qa/bim-static-viewer.png', fullPage: true });
  expect(errors).toEqual([]);
});
