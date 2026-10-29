import { expect, test, type Page } from '@playwright/test';
import { openAsOfficer } from './helpers';

// Responsive and visual checks (U7). Layout assertions are data-independent so they run the same on the
// demo dataset (CI) and on cloud staging. Screenshots are attached to the report for human review in
// light and dark mode instead of pixel baselines (fonts differ between Windows and Linux runners).

const VIEWPORTS = [
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1366, height: 768 },
  { name: 'wide', width: 1920, height: 1080 },
];

const PAGES = [
  { path: '/dashboard', ready: 'Việc của tôi' },
  { path: '/projects/appraisal', ready: 'Thẩm định BCNCKT' },
  { path: '/projects/permits', ready: 'Cấp giấy phép xây dựng' },
  { path: '/projects', ready: 'Danh mục dự án' },
  { path: '/help', ready: 'Phím tắt' },
];

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.scrollingElement || document.documentElement;
    const main = document.getElementById('main-content');
    return {
      page: doc.scrollWidth - window.innerWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    };
  });
  // The page itself never scrolls sideways; wide tables scroll inside their own container instead.
  expect(overflow.page, 'page scrolls horizontally').toBeLessThanOrEqual(1);
  expect(overflow.main, 'main content scrolls horizontally').toBeLessThanOrEqual(1);
}

for (const viewport of VIEWPORTS) {
  test.describe(`layout ${viewport.name} ${viewport.width}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const target of PAGES) {
      test(`${target.path} fits the screen`, async ({ page }) => {
        await openAsOfficer(page, target.path);
        await expect(page.getByText(target.ready, { exact: false }).first()).toBeVisible();
        await noHorizontalScroll(page);
        // Frame: menu and topbar controls stay visible.
        await expect(page.getByRole('navigation', { name: 'Điều hướng' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Tìm nhanh (Ctrl+K)' })).toBeVisible();
      });
    }

    test('dossier list: nothing floats over the list and SLA pills stay on one line', async ({ page }) => {
      await openAsOfficer(page, '/projects/appraisal');
      await expect(page.locator('main tbody tr').first()).toBeVisible();
      const pager = page.getByRole('navigation', { name: 'Phân trang' });
      if (await pager.isVisible()) {
        // Pagination only renders with more than one page; when present its "next" button must be on top.
        const next = pager.getByRole('button', { name: 'Trang sau' });
        await next.scrollIntoViewIfNeeded();
        const box = (await next.boundingBox())!;
        const onTop = await page.evaluate(
          ([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'),
          [box.x + box.width / 2, box.y + box.height / 2],
        );
        expect(onTop).toBe('Trang sau');
      }
      // The bottom-right corner of the content area belongs to the page (no floating widget over it).
      const corner = await page.evaluate(() => {
        const main = document.getElementById('main-content')!.getBoundingClientRect();
        const el = document.elementFromPoint(main.right - 40, main.bottom - 40);
        return !!el && !!el.closest('#main-content');
      });
      expect(corner, 'a floating element covers the content corner').toBe(true);

      const pills = page.locator('tbody [class*="rounded-full"][class*="whitespace-nowrap"]');
      const count = Math.min(await pills.count(), 10);
      for (let i = 0; i < count; i++) {
        const height = (await pills.nth(i).boundingBox())?.height || 0;
        expect(height, 'SLA pill wraps onto several lines').toBeLessThan(32);
      }
    });

    if (viewport.width >= 1366) {
      test('dossier list: filter bar fits on one row', async ({ page }) => {
        await openAsOfficer(page, '/projects/appraisal');
        const search = page.getByRole('textbox', { name: 'Tìm hồ sơ' });
        const sla = page.getByText('Tất cả hạn xử lý', { exact: true });
        await expect(search).toBeVisible();
        const [a, b] = [await search.boundingBox(), await sla.boundingBox()];
        expect(Math.abs((a?.y || 0) - (b?.y || 0)), 'filters wrap onto a second row').toBeLessThan(24);
      });
    }
  });
}

test.describe('visual review screenshots', () => {
  test.use({ viewport: { width: 1366, height: 900 } });
  for (const theme of ['nature', 'dark'] as const) {
    for (const target of PAGES.slice(0, 3)) {
      test(`${theme} ${target.path}`, async ({ page }, testInfo) => {
        await page.addInitScript((value) => window.localStorage.setItem('theme', value), theme);
        await openAsOfficer(page, target.path);
        await expect(page.getByText(target.ready, { exact: false }).first()).toBeVisible();
        await page.waitForLoadState('networkidle').catch(() => undefined);
        // Saved under test-results (uploaded by CI) and attached to the HTML report.
        const name = `${theme}${target.path.replace(/\//g, '-')}.png`;
        const path = testInfo.outputPath(name);
        await page.screenshot({ path, fullPage: false });
        await testInfo.attach(name, { path, contentType: 'image/png' });
      });
    }
  }
});
