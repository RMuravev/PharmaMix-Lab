import { expect, test, type Page } from '@playwright/test';
const calendar=Array.from({length:10},(_,i)=>`2026-${String(i+1).padStart(2,'0')}`);
const eligibleUnits=['A','B','C','D','E','F','G','H'];
const rows=calendar.flatMap((period,i)=>eligibleUnits.map(unitId=>({unitId,period,salesRub:100+i+(unitId==='A'&&i>=6?25:0),salesUnits:10,promoActive:unitId==='A'&&i>=6?1:0,weightedVisits:unitId==='A'&&i>=6?1:0})));
const matchedHeading='Результаты matched DiD',eventHeading='Event Study — динамика эффекта';
const summary=(page:Page)=>page.getByRole('region',{name:'Causal reliability summary'});
async function upload(page:Page){await page.getByLabel('JSON исследования').setInputFiles({name:'study.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({calendar,eligibleUnits,rows}))});}
async function prepare(page:Page){
 await page.getByLabel('Бренд',{exact:true}).fill('Brand');
 await page.getByRole('button',{name:'Подготовить из активного проекта'}).click();
 await expect(page.getByText(/Версия: v1/)).toBeVisible();
}
async function runMatched(page:Page){await page.getByRole('button',{name:'Оценить uplift',exact:true}).click();await expect(page.getByRole('heading',{name:matchedHeading})).toBeVisible();}
async function runEvent(page:Page){await page.getByRole('button',{name:'Рассчитать Event Study',exact:true}).click();await expect(page.getByRole('heading',{name:eventHeading,exact:true})).toBeVisible();}
async function publish(page:Page,version:string){
 await page.evaluate(async version=>{const path='/src/infrastructure/indexeddb/database.ts';const {openPharmaDatabase}=await import(path);const db:IDBDatabase=await openPharmaDatabase();const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put({id:'default',activeDatasetVersion:version});await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});},version);
}
async function countRecords(page:Page){return page.evaluate(async()=>{const path='/src/infrastructure/indexeddb/database.ts';const {openPharmaDatabase}=await import(path);const db:IDBDatabase=await openPharmaDatabase();const tx=db.transaction(['analysisRegistry','eventStudyDiagnostics'],'readonly');const a=tx.objectStore('analysisRegistry').count(),b=tx.objectStore('eventStudyDiagnostics').count();return new Promise<number>(resolve=>{tx.oncomplete=()=>resolve(a.result+b.result);});});}
test.beforeEach(async({page})=>{
 page.on('pageerror',error=>{throw error;});
 page.on('console',message=>{if(message.type()==='error')throw new Error(message.text());});
 await page.goto('/workspace#causal-lift');
 await expect(page.getByRole('heading',{name:'Квазиэкспериментальная оценка uplift'})).toBeVisible();
 await page.evaluate(async({rows})=>{
  const path='/src/infrastructure/indexeddb/database.ts';const {openPharmaDatabase}=await import(path);const db:IDBDatabase=await openPharmaDatabase();
  const tx=db.transaction(['projects','salesFacts','promoFacts','visitFacts'],'readwrite');
  tx.objectStore('projects').put({id:'default',activeDatasetVersion:'v1'});
  rows.forEach((r,i)=>{
   tx.objectStore('salesFacts').put({id:`s${i}`,projectId:'default',datasetVersion:'v1',period:r.period,region:r.unitId,city:'City',chain:r.unitId,brand:'Brand',sku:'SKU',units:r.salesUnits,revenueRub:r.salesRub});
   if(r.promoActive)tx.objectStore('promoFacts').put({id:`p${i}`,projectId:'default',datasetVersion:'v1',period:r.period,chain:r.unitId,brand:'Brand',sku:'SKU',bonusRatePct:0});
   if(r.weightedVisits)tx.objectStore('visitFacts').put({id:`v${i}`,projectId:'default',datasetVersion:'v1',period:r.period,region:r.unitId,city:'City',brand:'Brand',weightedVisits:1});
  });
  await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
 },{rows});
});
test('uploaded sandbox runs both estimators, hides changed parameters and never auto-saves',async({page})=>{
 await upload(page);await runMatched(page);await runEvent(page);
 await expect(summary(page)).toContainText('unverifiable');await expect(summary(page)).toContainText('insufficient');
 expect(await countRecords(page)).toBe(0);
 for(const [label,value] of [['Продажи','salesUnits'],['Драйвер','weightedVisits'],['Старт воздействия','2026-08'],['Месяцев до','4'],['Месяцев после','2']]){
  if(label==='Продажи'||label==='Драйвер')await page.getByRole('combobox',{name:label,exact:true}).selectOption(value);else await page.getByLabel(label,{exact:true}).fill(value);
  await expect(page.getByRole('heading',{name:eventHeading,exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:matchedHeading})).toHaveCount(0);
  await runEvent(page);
 }
 expect(await countRecords(page)).toBe(0);
 await page.getByLabel('JSON исследования').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"rows":[]}')});
 await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('button',{name:'Рассчитать Event Study'})).toBeDisabled();
});
test('dataset publication hides both outputs and rejects stale recomputation and saves',async({page})=>{
 await prepare(page);await runMatched(page);await runEvent(page);await expect.poll(()=>countRecords(page)).toBe(2);
 await publish(page,'v2');
 await expect(page.getByRole('heading',{name:matchedHeading})).toHaveCount(0);await expect(page.getByRole('heading',{name:eventHeading,exact:true})).toHaveCount(0);
 await expect(summary(page)).toContainText('insufficient');
 await page.getByRole('button',{name:'Оценить uplift',exact:true}).click();await expect(page.getByRole('alert')).toContainText('stale');
 await page.getByRole('button',{name:'Рассчитать Event Study'}).click();await expect(page.getByRole('alert')).toContainText('stale');
 expect(await countRecords(page)).toBe(2);
});
test('brand, grain and project changes invalidate matched and event output',async({page})=>{
 for(const change of ['brand','grain','project']){
  if(change==='project')await page.getByRole('combobox',{name:'Исследование',exact:true}).selectOption('promo-chain-brand');
  await prepare(page);await runMatched(page);await runEvent(page);
  if(change==='brand')await page.getByLabel('Бренд',{exact:true}).fill('Other');
  if(change==='grain')await page.getByRole('combobox',{name:'Исследование',exact:true}).selectOption('visits-region-brand');
  if(change==='project')await page.getByLabel('Идентификатор проекта').fill('other-project');
  await expect(page.getByRole('heading',{name:matchedHeading})).toHaveCount(0);await expect(page.getByRole('heading',{name:eventHeading,exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Оценить uplift',exact:true})).toBeDisabled();
 }
});
test('verification failure hides active output and rejects subsequent calculations',async({page})=>{
 await prepare(page);await runMatched(page);await runEvent(page);
 await page.evaluate(()=>{const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args:Parameters<IDBDatabase['transaction']>){if(args[0]==='projects'&&args[1]==='readonly')throw new Error('forced identity read failure');return original.apply(this,args);};});
 await expect(page.getByRole('heading',{name:matchedHeading})).toHaveCount(0);await expect(page.getByRole('heading',{name:eventHeading,exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Оценить uplift',exact:true}).click();await expect(page.getByRole('alert')).toContainText('unverifiable');
 expect(await countRecords(page)).toBe(2);
});
test('obsolete preparation and deferred calculation cannot relabel or save another selection',async({page})=>{
 await page.evaluate(async()=>{
  const path='/src/infrastructure/indexeddb/activeDatasetSnapshotRepository.ts';const {ActiveDatasetSnapshotRepository}=await import(path);
  const original=ActiveDatasetSnapshotRepository.prototype.getForProject;
  ActiveDatasetSnapshotRepository.prototype.getForProject=async function(id:string){const snapshot=await original.call(this,id);await new Promise<void>(resolve=>{(window as unknown as {releasePrepare:()=>void}).releasePrepare=resolve;});return snapshot;};
 });
 await page.getByLabel('Бренд',{exact:true}).fill('Brand');await page.getByRole('button',{name:'Подготовить из активного проекта'}).click();
 await expect.poll(()=>page.evaluate(()=>typeof (window as unknown as {releasePrepare?:()=>void}).releasePrepare)).toBe('function');
 await page.getByLabel('Бренд',{exact:true}).fill('Other');await page.evaluate(()=>(window as unknown as {releasePrepare:()=>void}).releasePrepare());
 await expect(page.getByRole('button',{name:'Оценить uplift',exact:true})).toBeDisabled();expect(await countRecords(page)).toBe(0);
 await upload(page);
 await page.evaluate(()=>{const original=window.requestAnimationFrame;window.requestAnimationFrame=callback=>{window.requestAnimationFrame=original;(window as unknown as {releaseCompute:()=>void}).releaseCompute=()=>callback(performance.now());return 0;};});
 await page.getByRole('button',{name:'Оценить uplift',exact:true}).click();
 await page.getByRole('combobox',{name:'Продажи',exact:true}).selectOption('salesUnits');
 await page.evaluate(()=>(window as unknown as {releaseCompute:()=>void}).releaseCompute());
 await expect(page.getByRole('heading',{name:matchedHeading})).toHaveCount(0);expect(await countRecords(page)).toBe(0);
});

test('placebo maximum and bootstrap metadata describe the same production report as displayed leads',async({page})=>{
 const units=['A','B','C','D','E','F'];
 const placeboRows=calendar.flatMap((period,i)=>units.map(unitId=>({unitId,period,salesRub:unitId==='A'&&i===3?20:0,promoActive:unitId==='A'&&i>=5?1:0})));
 await page.getByLabel('JSON исследования').setInputFiles({name:'placebo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({calendar,eligibleUnits:units,rows:placeboRows}))});
 await page.getByLabel('Месяцев после',{exact:true}).fill('1');await runEvent(page);
 const panel=page.locator('section').filter({has:page.getByRole('heading',{name:eventHeading,exact:true})});
 await expect(panel.getByRole('row',{name:'-2 20 20 … 20 1 1',exact:true})).toBeVisible();
 await expect(panel.getByText('Максимальный абсолютный placebo-эффект:',{exact:true}).locator('..')).toHaveText('Максимальный абсолютный placebo-эффект: 20. Bootstrap: 400 повторов.');
});

test('numerical overflow produces an explicit error without inference or automatic writes',async({page})=>{
 const units=['A','B','C','D','E','F'];
 const extremeRows=calendar.flatMap((period,i)=>units.map(unitId=>({unitId,period,salesRub:unitId!=='A'&&i===3?1e308:0,promoActive:unitId==='A'&&i>=5?1:0})));
 await page.getByLabel('JSON исследования').setInputFiles({name:'extreme.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({calendar,eligibleUnits:units,rows:extremeRows}))});
 await page.getByLabel('Месяцев после',{exact:true}).fill('1');await page.getByRole('button',{name:'Рассчитать Event Study'}).click();
 await expect(page.getByRole('alert')).toContainText('numerically unestimable');
 await expect(page.getByRole('heading',{name:eventHeading,exact:true})).toHaveCount(0);
 await expect(summary(page)).toContainText('insufficient');expect(await countRecords(page)).toBe(0);
});
