import { expect, test } from '@playwright/test';
import { openAsOfficer } from './helpers';

test('permit register lists issued, amended, started and cancelled permits (Điều 63–66)', async ({ page }) => {
  await openAsOfficer(page, '/projects/permits');
  await page.getByRole('button', { name: 'Sổ giấy phép', exact: true }).click();
  // Department scope (RLS): the QLXD officer sees QLXD permits only.
  await expect(page.getByText('12/2025/GPXD', { exact: true })).toBeVisible();
  await expect(page.getByText('Đã hủy', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Tìm kiếm' }).fill('12/2025');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByText(/^Điều chỉnh \d{2}\/\d{2}\/2026$/)).toBeVisible();
  await expect(page.getByText('Đã khởi công', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hồ sơ đề nghị', exact: true }).click();
});
