import { expect, type Page } from '@playwright/test';

/** Opens a page, signing in with a staging test account (by role label) when the login screen is shown. */
export async function openAs(page: Page, path: string, role = 'Chuyên viên') {
  await page.goto(path);
  const picker = page.getByText('Chọn vai trò để đăng nhập ngay');
  await expect(picker.or(page.locator('aside')).first()).toBeVisible();
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByText(role, { exact: true }).click();
  }
  await expect(page.locator('main, [role="main"]').first()).toBeVisible();
}

export async function chooseOption(page: Page, current: string, option: string) {
  await page.getByText(current, { exact: true }).first().click();
  await page.getByText(option, { exact: true }).last().click();
}

export const openAsOfficer = (page: Page, path: string) => openAs(page, path);
