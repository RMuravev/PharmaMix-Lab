import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Both uncaught errors and errors caught by the legacy render boundary fail E2E.
  page.on('pageerror', error => { throw error; });
  page.on('console', message => {
    if (message.type() === 'error') throw new Error(message.text());
  });
});

async function openLegacy(page: Page) {
  const response = await page.goto('/');
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('#headerRoleSelect')).toBeVisible();
}

test('renders Executive Brief and navigates between reports without runtime errors', async ({ page }) => {
  await openLegacy(page);
  const brief = page.locator('#page-exec-brief');
  await expect(brief).toBeVisible();
  await expect(brief.getByRole('heading', { name: /Executive Brief/ })).toBeVisible();
  await expect(page.locator('#execBriefSalesCanvas')).toBeVisible();
  await page.locator('#nav button[data-page="top-roi"]').click();
  await expect(page.locator('#page-top-roi')).toBeVisible();
  await expect(brief).toBeHidden();
  await page.locator('#nav button[data-page="exec-brief"]').click();
  await expect(brief).toBeVisible();
});

test('imports observed sales including zeroes and reports their revenue', async ({ page }) => {
  await openLegacy(page);
  await page.locator('#headerRoleSelect').selectOption('developer');
  await page.locator('#nav button[data-page="data-partitions"]').click();
  const partitions = page.locator('#page-data-partitions');
  await expect(partitions).toBeVisible();
  const csv = [
    'Год;Месяц (Номер);SKU Бренд;SKU Наименование;federal_subject;city;PhChainName;xMark Продажи Выбытия, уп;xMark Продажи Выбытия, руб',
    '2026;1;RegressionBrand;RegressionSKU;Москва;Москва;Chain A;10;10000',
    '2026;2;RegressionBrand;RegressionSKU;Москва;Москва;Chain A;0;0',
  ].join('\n');
  await partitions.locator('#salesFile').setInputFiles({ name: 'sales.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(partitions.locator('#salesStatus')).toHaveText('2 строк');
  await expect(partitions.locator('#salesTableContainer')).toContainText('RegressionBrand');
  await expect(partitions.locator('#salesTableContainer')).toContainText('2026-02');
  await partitions.locator('#loadFiles').click();
  await expect(partitions.locator('#importMessage')).toHaveClass(/good/);
  await page.locator('#headerRoleSelect').selectOption('all');
  await page.locator('#nav button[data-page="exec-brief"]').click();
  const revenue = page.locator('#page-exec-brief .card').filter({ hasText: 'Совокупная Выручка' }).first();
  await expect(revenue).toContainText(/10\s*000\s*₽/);
  // Re-entering the page replaces its DOM; preview roots must follow new elements.
  await page.locator('#headerRoleSelect').selectOption('developer');
  await page.locator('#nav button[data-page="data-partitions"]').click();
  await expect(partitions.locator('#salesTableContainer')).toContainText('RegressionBrand');
  await expect(partitions.locator('#salesStatus')).toHaveText('2 строк');
});

test('shows an empty current-version registry before a dataset is published', async ({ page }) => {
  await page.goto('/workspace#causal-mmm');
  await expect(page.getByRole('heading', { name: 'MMM × Causal Lift · реестр результатов' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('нет опубликованной версии');
  await expect(page.getByRole('button', { name: 'Сохранить оценку в реестр', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
