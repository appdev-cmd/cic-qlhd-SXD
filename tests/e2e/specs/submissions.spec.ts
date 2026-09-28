import { expect, test } from '@playwright/test';
import { chooseOption, openAs, openAsOfficer } from './helpers';

test('filter bar keeps the standard order and SLA filter narrows the list', async ({ page }) => {
  await openAsOfficer(page, '/projects/appraisal');
  await expect(page.getByRole('heading', { name: 'Thẩm định BCNCKT' })).toBeVisible();
  const search = page.getByRole('textbox', { name: 'Tìm hồ sơ' });
  const slaFilter = page.getByText('Tất cả hạn xử lý', { exact: true });
  await expect(search).toBeVisible();
  await expect(slaFilter).toBeVisible();
  const searchBox = await search.boundingBox();
  const slaBox = await slaFilter.boundingBox();
  expect(searchBox!.y < slaBox!.y || searchBox!.x < slaBox!.x).toBeTruthy();

  await expect(page.getByRole('button', { name: 'Hạn xử lý', exact: true })).toBeVisible();
  await chooseOption(page, 'Tất cả hạn xử lý', 'Quá hạn');
  await expect(page.getByText(/hồ sơ · trang 1/)).toBeVisible();
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  // Auto-retrying: the list reloads asynchronously after the filter changes.
  await expect(rows.filter({ hasNotText: 'Quá hạn' })).toHaveCount(0);
});

test('child form guard keeps the panel and typed data on Escape and backdrop clicks', async ({ page }) => {
  // Head of department: workflow actions are not limited to the assigned officer (demo: no login screen).
  await openAs(page, '/projects/appraisal', 'Trưởng phòng');
  // Overdue submissions are open (not superseded, paused or completed), so workflow actions exist.
  await chooseOption(page, 'Tất cả hạn xử lý', 'Quá hạn');
  const rows = page.locator('tbody tr');
  await expect(rows.filter({ hasNotText: 'Quá hạn' })).toHaveCount(0);
  await rows.first().getByRole('button').first().click();
  const panelHeading = page.getByRole('heading', { name: /Quy trình xử lý/ }).last();
  await expect(panelHeading).toBeVisible();
  await expect(page.getByText('Hạn xử lý', { exact: true }).last()).toBeVisible();
  const action = page.getByRole('button', { name: 'Yêu cầu bổ sung', exact: true }).last();
  await expect(action).toBeVisible();
  await action.click();
  const dialog = page.getByRole('dialog', { name: 'Yêu cầu bổ sung' });
  await expect(dialog).toBeVisible();
  const note = dialog.locator('textarea');
  await note.fill('Nội dung kiểm thử không lưu — kiểm tra bảo vệ form con.');

  await page.keyboard.press('Escape');
  await expect(dialog.getByText('Có thay đổi chưa lưu.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Tiếp tục nhập' }).click();
  await expect(note).toHaveValue('Nội dung kiểm thử không lưu — kiểm tra bảo vệ form con.');

  await page.mouse.click(5, 450);
  await expect(dialog).toBeVisible();
  await expect(panelHeading).toBeVisible();

  await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: 'Bỏ thay đổi và đóng' }).click();
  await expect(dialog).toBeHidden();
  await expect(panelHeading).toBeVisible();
});
