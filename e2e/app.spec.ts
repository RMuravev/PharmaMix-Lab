import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error; });
  page.on('console', message => {
    if (message.type() === 'error') throw new Error(message.text());
  });
});

async function openWorkspace(page: Page) {
  const response = await page.goto('/workspace');
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByRole('navigation', { name: 'Навигация рабочего пространства' })).toBeVisible();
}

test('renders the current workspace and navigates between current reports', async ({ page }) => {
  await openWorkspace(page);
  await expect(page.getByRole('heading', { name: 'Обзор продаж' })).toBeVisible();
  await page.getByRole('button', { name: 'Коммерческая аналитика' }).click();
  await expect(page.getByRole('heading', { name: 'Коммерческая аналитика' })).toBeVisible();
  await page.getByRole('button', { name: 'Публикация набора данных' }).click();
  await expect(page.getByRole('heading', { name: 'Публикация полного набора данных' })).toBeVisible();
});

test('publishes current snapshot sales including zeroes and reports their revenue', async ({ page }) => {
  await page.goto('/workspace#snapshot-import');
  await expect(page.getByRole('heading', { name: 'Публикация полного набора данных' })).toBeVisible();
  const csv = [
    'period,region,city,chain,brand,sku,units,revenueRub',
    '2026-01,Москва,Москва,Chain A,RegressionBrand,RegressionSKU,10,10000',
    '2026-02,Москва,Москва,Chain A,RegressionBrand,RegressionSKU,0,0',
  ].join('\n');
  const cards = page.locator('.pm-snapshot-source');
  await cards.filter({ hasText: 'Продажи аптек' }).locator('input[type=file]').setInputFiles({ name: 'sales.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  for (const source of ['Рыночные данные', 'Промо', 'ТВ-реклама', 'Визиты медицинских представителей']) {
    await cards.filter({ hasText: source }).getByLabel('Намеренно пустой').check();
  }
  await page.getByRole('button', { name: 'Проверить снимок' }).click();
  await expect(page.getByRole('heading', { name: '2. Результат проверки' })).toBeVisible();
  await page.getByRole('button', { name: 'Опубликовать полный снимок' }).click();
  await expect(page.getByRole('status')).toContainText('Снимок опубликован');
  await page.getByRole('button', { name: 'Обзор продаж' }).click();
  await expect(page.getByRole('heading', { name: 'Обзор продаж' })).toBeVisible();
  await expect(page.getByLabel('Ключевые показатели').getByText(/10\s*000/)).toBeVisible();
  const zeroMonth = page.getByRole('row').filter({ hasText: '2026-02' });
  await expect(zeroMonth).toContainText('0');
  await expect(page.getByText(/Источник: 2 нормализованных строк/)).toBeVisible();
});

test('shows an empty current-version registry before a dataset is published', async ({ page }) => {
  await page.goto('/workspace#causal-mmm');
  await expect(page.getByRole('heading', { name: 'MMM × Causal Lift · реестр результатов' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('нет опубликованной версии');
  await expect(page.getByRole('button', { name: 'Сохранить оценку в реестр', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('runs and explains a realistic current-dataset Model Tournament', async ({ page }) => {
  await page.goto('/workspace#snapshot-import');
  await page.getByLabel('Идентификатор проекта').fill('tournament-e2e');
  const months=Array.from({length:20},(_,index)=>`${2025+Math.floor(index/12)}-${String(index%12+1).padStart(2,'0')}`);
  const sales=['period,region,city,chain,brand,sku,units,revenueRub',...months.map((period,index)=>`${period},R,C,Chain,TournamentBrand,SKU,${10+index},${1000+80*index}`)].join('\n');
  const tv=['period,brand,trp',...months.map((period,index)=>`${period},TournamentBrand,${10+index}`)].join('\n');
  const cards=page.locator('.pm-snapshot-source');
  await cards.filter({hasText:'Продажи аптек'}).locator('input[type=file]').setInputFiles({name:'sales.csv',mimeType:'text/csv',buffer:Buffer.from(sales)});
  await cards.filter({hasText:'ТВ-реклама'}).locator('input[type=file]').setInputFiles({name:'tv.csv',mimeType:'text/csv',buffer:Buffer.from(tv)});
  for(const source of ['Рыночные данные','Промо','Визиты медицинских представителей']) await cards.filter({hasText:source}).getByLabel('Намеренно пустой').check();
  await page.getByRole('button',{name:'Проверить снимок'}).click();
  await page.getByRole('button',{name:'Опубликовать полный снимок'}).click();
  await expect(page.getByRole('status')).toContainText('Снимок опубликован');
  await page.getByRole('button',{name:'Model Tournament · beta'}).click();
  await expect(page.getByRole('heading',{name:'Model Tournament v2'})).toBeVisible();
  await expect(page.getByLabel('Tournament brand')).toHaveValue('TournamentBrand');
  await page.getByRole('button',{name:'Prepare active dataset'}).click();
  await expect(page.getByRole('status')).toContainText('Prepared');
  await page.getByRole('button',{name:'Run tournament'}).click();
  await expect(page.getByRole('heading',{name:/Recommendation:/})).toBeVisible({timeout:30_000});
  await expect(page.getByText(/Predictive selection does not establish causal validity|lacks both practical separation/)).toBeVisible();
  await expect(page.getByRole('heading',{name:'Fold drill-down'})).toBeVisible();
});
