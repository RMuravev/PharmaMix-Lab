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
async function stageCsv(page:Page,source:string,name:string,csv:string,overlap='cancel'){
  await page.getByLabel('Import source').selectOption(source);
  await page.locator('input[type=file]').setInputFiles({name,mimeType:'text/csv',buffer:Buffer.from(csv)});
  await page.getByLabel('Overlap behavior').selectOption(overlap);
  await page.getByRole('button',{name:'Stage file'}).click();
  await expect(page.getByRole('status')).toContainText('staged');
}
async function markKnownEmpty(page:Page,source:string,start='2025-01',end='2026-12'){
  await page.getByLabel(`${source} coverage start`).fill(start);await page.getByLabel(`${source} coverage end`).fill(end);await page.getByLabel(`${source} status`).selectOption('KNOWN_EMPTY');
}

test('renders the current workspace and navigates between current reports', async ({ page }) => {
  await openWorkspace(page);
  await expect(page.getByRole('heading', { name: 'Обзор продаж' })).toBeVisible();
  await page.getByRole('button', { name: 'Коммерческая аналитика' }).click();
  await expect(page.getByRole('heading', { name: 'Коммерческая аналитика' })).toBeVisible();
  await page.getByRole('button', { name: 'Публикация набора данных' }).click();
  await expect(page.getByRole('heading', { name: 'Data Import Workspace' })).toBeVisible();
});

test('publishes current snapshot sales including zeroes and reports their revenue', async ({ page }) => {
  await page.goto('/workspace#snapshot-import');
  await expect(page.getByRole('heading', { name: 'Data Import Workspace' })).toBeVisible();
  const header='Год;Месяц (Номер);SKU Бренд;SKU Наименование;federal_district;federal_subject;city;Nanobrick;PhChainName;xMark Продажи Выбытия, уп;xMark Продажи Выбытия, руб';
  await stageCsv(page,'sales','2026_sales.csv',[header,'2026;1;RegressionBrand;RegressionSKU;;Москва;Москва;;Chain A;10;10000','2026;2;RegressionBrand;RegressionSKU;;Москва;Москва;;Chain A;0;0'].join('\n'));
  for(const source of ['Market','Medical Rep Visits','TV','Promo'])await markKnownEmpty(page,source,'2026-01','2026-02');
  await page.getByRole('button',{name:'Validate staged dataset'}).click();
  await page.getByRole('button',{name:'Publish immutable dataset'}).click();
  await expect(page.getByRole('status')).toContainText('Published immutable dataset');
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

test('stages real multi-file templates across reload and publishes Promo as NOT_PROVIDED',async({page})=>{
  await page.goto('/workspace#snapshot-import');await page.getByLabel('Идентификатор проекта').fill('real-template-e2e');
  const salesHeader='Год;Месяц (Номер);SKU Бренд;SKU Наименование;federal_district;federal_subject;city;Nanobrick;PhChainName;xMark Продажи Выбытия, уп;xMark Продажи Выбытия, руб';
  await stageCsv(page,'sales','2024_sales.csv',`\uFEFF${salesHeader}\n2024;1;Кагоцел;Кагоцел №10;;;Химки;Московская обл. Химки;Group 36,6;6;1453,8`);
  await stageCsv(page,'sales','2025_sales.csv',`${salesHeader}\n2025;1;Кагоцел;Кагоцел №10;;;Химки;Московская обл. Химки;Group 36,6;7;1700,5`);
  await stageCsv(page,'market','market.csv','Год;Месяц (Номер);Адресный рынок;federal_district;Бренд;SKU;Продажи, шт;Продажи, руб;Наш бренд\n2024;1;Кагоцел;Алтайский край;Кагоцел (Биннофарм групп);;14976,222;6666937,464;1');
  await stageCsv(page,'visits','visits.csv','Год;Месяц (Номер);Nanobrick;cc_brand_name;CRM Подтв. визиты, кол-во\n2024;1;Адыгея респ. Тахтамукайский р-н;Кагоцел;26');
  await stageCsv(page,'tv','tv.csv','Год;Месяц;Бренд;TRP\n2025;1;Кагоцел;1011');
  await page.reload();await expect(page.getByText(/2 files · 2 rows/)).toBeVisible();await expect(page.getByLabel('Promo status')).toHaveValue('NOT_PROVIDED');
  await page.getByRole('button',{name:'Validate staged dataset'}).click();await expect(page.getByRole('row').filter({hasText:'Promo'})).toContainText('NOT_PROVIDED');
  await page.getByRole('button',{name:'Publish immutable dataset'}).click();await expect(page.getByRole('status')).toContainText('Promo status: NOT_PROVIDED');
});

test('runs and explains a realistic current-dataset Model Tournament', async ({ page }) => {
  await page.goto('/workspace#snapshot-import');
  await page.getByLabel('Идентификатор проекта').fill('tournament-e2e');
  const months=Array.from({length:20},(_,index)=>`${2025+Math.floor(index/12)}-${String(index%12+1).padStart(2,'0')}`);
  const salesHeader='Год;Месяц (Номер);SKU Бренд;SKU Наименование;federal_district;federal_subject;city;Nanobrick;PhChainName;xMark Продажи Выбытия, уп;xMark Продажи Выбытия, руб';
  const sales=[salesHeader,...months.flatMap((period,index)=>{const [year,month]=period.split('-');return[`${year};${Number(month)};TournamentBrand;SKU;;R;C;;Chain;${10+index};${1000+80*index}`,`${year};${Number(month)};SecondBrand;SKU;;R;C;;Chain;${8+index};${800+50*index}`];})].join('\n');
  const tv=['Год;Месяц;Бренд;TRP',...months.flatMap((period,index)=>{const [year,month]=period.split('-');return[`${year};${Number(month)};TournamentBrand;${10+index}`,`${year};${Number(month)};SecondBrand;${8+index}`];})].join('\n');
  await stageCsv(page,'sales','sales.csv',sales);await stageCsv(page,'tv','tv.csv',tv);
  for(const source of ['Market','Medical Rep Visits','Promo'])await markKnownEmpty(page,source,'2025-01','2026-08');
  await page.getByRole('button',{name:'Validate staged dataset'}).click();await page.getByRole('button',{name:'Publish immutable dataset'}).click();
  await expect(page.getByRole('status')).toContainText('Published immutable dataset');
  await page.getByRole('button',{name:'Model Tournament · beta'}).click();
  await expect(page.getByRole('heading',{name:'Model Tournament v2'})).toBeVisible();
  await page.getByLabel('Tournament brand').selectOption('TournamentBrand');
  await page.getByRole('button',{name:'Prepare active dataset'}).click();
  await expect(page.getByRole('status')).toContainText('Prepared');
  await page.getByLabel('Tournament brand').selectOption('SecondBrand');
  await expect(page.getByRole('button',{name:'Run tournament'})).toBeDisabled();
  await expect(page.getByRole('heading',{name:/Recommendation:/})).toHaveCount(0);
  await page.getByLabel('Tournament brand').selectOption('TournamentBrand');
  await page.getByRole('button',{name:'Prepare active dataset'}).click();
  await expect(page.getByRole('status')).toContainText('Prepared');
  await page.getByRole('button',{name:'Run tournament'}).click();
  await expect(page.getByRole('heading',{name:/Recommendation:/})).toBeVisible({timeout:30_000});
  await expect(page.getByText(/Predictive selection does not establish causal validity|lacks both practical separation/)).toBeVisible();
  await expect(page.getByRole('heading',{name:'Fold drill-down'})).toBeVisible();
  await expect(page.locator('p').filter({hasText:'Immutable evaluated scope:'})).toContainText('TournamentBrand');
  await expect(page.getByRole('cell',{name:'Lasso',exact:true}).locator('..')).toContainText('succeeded');
});
