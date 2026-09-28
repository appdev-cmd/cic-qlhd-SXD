import { expect, test } from '@playwright/test';
import { openAsOfficer } from './helpers';

test('dashboard shows SLA tiles ordered by urgency', async ({ page }) => {
  await openAsOfficer(page, '/dashboard');
  const section = page.getByRole('region', { name: 'Hạn xử lý các lần nộp' });
  await expect(section).toBeVisible();
  const labels = await section.locator('.grid > div > p:first-child').allTextContents();
  expect(labels.slice(0, 3)).toEqual(['Quá hạn', 'Sắp đến hạn', 'Trong hạn']);
});
