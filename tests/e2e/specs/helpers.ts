import { expect, type Page } from '@playwright/test';

/** Opens a page, signing in with a staging test account (by role label) when the login screen is shown. */
export async function openAs(page: Page, path: string, role = 'Chuyên viên') {
  await page.goto(path);
  const picker = page.getByText('Chọn vai trò để đăng nhập ngay');
  // The app frame's <main id="main-content"> only exists after sign-in; the login screen also has an
  // <aside> (hero), so waiting for "aside" raced with the test-account list loading.
  const app = page.locator('#main-content');
  await expect(picker.or(app).first()).toBeVisible();
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByText(role, { exact: true }).click();
  }
  await expect(app).toBeVisible();
}

export async function chooseOption(page: Page, current: string, option: string) {
  const trigger = page.getByText(current, { exact: true }).first();
  const choice = page.getByText(option, { exact: true }).last();
  // The select opens on click; retry once when the list was not rendered yet (list reload in progress).
  for (let attempt = 0; attempt < 3; attempt++) {
    await trigger.click();
    if (await choice.isVisible({ timeout: 3000 }).catch(() => false)) break;
  }
  await choice.click();
}

export const openAsOfficer = (page: Page, path: string) => openAs(page, path);
