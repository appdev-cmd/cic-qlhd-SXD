import { expect, test } from '@playwright/test';
import { openAsOfficer } from './helpers';

// Sample dataset v3 (deterministic id): DA-2026-DB-0189, round 2 — eligible after revision, then stamped.
const DOSSIER = '/dossiers/a2283ef4-5e65-5788-aee8-2b6a553c033c';

test('appraisal sheet shows the Điều 38 groups and the stamping loop of khoản 8 Điều 36', async ({ page }) => {
  await openAsOfficer(page, DOSSIER);
  await page.getByRole('button', { name: 'Phiếu thẩm định', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Phiếu thẩm định Báo cáo nghiên cứu khả thi' })).toBeVisible();
  await expect(page.getByText('Phiếu đã đủ điều kiện để hoàn tất rà soát.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /^4\. Quy chuẩn kỹ thuật/ })).toBeVisible();
  await expect(page.getByText('Chỉ đủ điều kiện sau khi hoàn thiện các nội dung yêu cầu').first()).toBeVisible();
  // Reviewed dossiers are locked until reopened.
  await expect(page.getByRole('button', { name: 'Lưu phiếu thẩm định' })).toBeDisabled();

  await page.getByRole('button', { name: 'Đóng dấu & lưu trữ', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Đã đóng dấu; chờ bản chụp PDF/ })).toBeVisible();
  await expect(page.getByText('Tổng mặt bằng và định vị công trình')).toBeVisible();
  await expect(page.getByText('Hồ sơ chỉnh sửa chưa đáp ứng; trả lại')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nhận bản chụp PDF bản vẽ đã đóng dấu' })).toBeVisible();
});
