import {readFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const fixture={id:'neutral-test',version:'1',title:'Тестовая программа',startRules:[{label:'Перед началом',text:'Проверить самочувствие',source:'fixture'}],sections:[{id:'test',title:'Тестовый раздел',text:'Проверка импорта',source:'fixture'}],exercises:[{id:'climb',mode:'A',title:'Трассы',kind:'climb',dose:'3 попытки',instruction:'Держать корпус',minutes:null,source:'fixture',section:'test'},{id:'hang',mode:'A',title:'Висы',kind:'hang',dose:'3 × 7 сек',instruction:'Без боли',minutes:null,source:'fixture',section:'test'}],templates:[{id:'A',name:'Тренировка А',type:'A',exerciseIds:['climb','hang']}],weeks:[],sources:[],glossary:{}};
const dayCell=(page:import('@playwright/test').Page)=>page.locator('.date-cell[aria-label*="22 сентября"]');
test.beforeEach(async({page})=>{await page.clock.setFixedTime(new Date('2026-09-22T12:00:00Z'))});

test('календарь, программа, запись, копия и офлайн',async({page,browser})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Календарь'})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Разделы'}).getByRole('button')).toHaveCount(2);
  await page.getByRole('button',{name:'Программа'}).click();
  await expect(page.getByRole('heading',{name:'Боулдеринг · сентябрь 2026 — май 2027'})).toBeVisible();
  await expect(page.locator('.template-bottom a[download]')).toHaveCount(1);
  await page.locator('.program-page input[type=file]').setInputFiles({name:'program.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
  await expect(page.getByRole('heading',{name:'Тестовая программа'})).toBeVisible();
  await expect(page.locator('.start-rules summary')).toContainText('Правила начала и остановки · 1');
  await expect(page.locator('.template-bottom a[download]')).toHaveCount(1);
  await page.getByRole('button',{name:'Календарь'}).click();
  await dayCell(page).click();
  await expect(page.getByRole('heading',{name:/22 сентября/})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Разделы'})).toHaveCount(0);
  await expect(page.getByText('СВАЙП ВПРАВО — НАЗАД')).toHaveCount(0);
  await expect(page.locator('.training-panel')).toHaveCount(1);
  await page.getByLabel('Что хочу попробовать').fill('Работа ногами');
  await page.getByRole('combobox',{name:'План из программы'}).selectOption('A');
  await expect(page.getByText('3 попытки')).toBeVisible();
  await page.getByLabel('Лазание — что получилось').fill('Синяя 7A, 3 попытки');
  await page.getByLabel('ОФП и висы — что сделал').fill('Висы 3 × 7 секунд');
  await page.getByLabel('Длительность, минуты').selectOption('95');
  await page.getByLabel(/RPE — субъективная тяжесть/).selectOption('6');
  await page.getByLabel(/Левая кисть — дискомфорт/).selectOption('1');
  await page.getByRole('button',{name:'К календарю'}).click();
  await expect(dayCell(page)).toHaveAttribute('aria-label',/есть запись/);
  await page.reload();await dayCell(page).click();
  await expect(page.getByLabel('Лазание — что получилось')).toHaveValue('Синяя 7A, 3 попытки');
  await expect(page.getByRole('button',{name:'Удалить запись за день'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  await page.context().setOffline(true);await page.reload();
  await expect(page.getByLabel('ОФП и висы — что сделал')).toHaveValue('Висы 3 × 7 секунд');
  await page.context().setOffline(false);await page.getByRole('button',{name:'К календарю'}).click();
  await page.getByRole('button',{name:'Данные и резервная копия'}).click();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Сохранить копию JSON'}).click();
  const raw=await readFile((await (await downloadPromise).path())!,'utf8');
  const backup=JSON.parse(raw);
  expect(backup.days).toHaveLength(1);
  expect(backup.days[0]).toMatchObject({date:'2026-09-22',goal:'Работа ногами',climbing:'Синяя 7A, 3 попытки',conditioning:'Висы 3 × 7 секунд',duration:95,rpe:6,leftWrist:1});
  expect(backup.programs).toHaveLength(1);
  const clean=await browser.newContext();const second=await clean.newPage();await second.goto('/');
  await second.getByRole('button',{name:'Данные и резервная копия'}).click();
  await second.locator('.settings-dialog input[type=file]').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(raw)});
  await expect(second.getByText('1 дней')).toBeVisible();
  second.once('dialog',dialog=>dialog.accept());
  await second.getByRole('button',{name:'Заменить данные этой копией'}).click();
  await expect(second.getByText('Данные восстановлены.')).toBeVisible();
  await second.getByRole('button',{name:'Закрыть'}).click();await dayCell(second).click();
  await expect(second.getByLabel('Лазание — что получилось')).toHaveValue('Синяя 7A, 3 попытки');
  await clean.close();expect(errors).toEqual([]);
});

test('мобильная страница и свайп вправо',async({page})=>{
  await page.setViewportSize({width:375,height:812});await page.goto('/');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByRole('button',{name:'Предыдущий месяц'}).click();
  await expect(page.getByRole('heading',{name:'август 2026 г.'})).toBeVisible();
  await page.locator('.date-cell[aria-label*="22 августа"]').click();
  await expect(page.getByRole('heading',{name:/22 августа/})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.locator('.day-page').evaluate(element=>{
    element.dispatchEvent(new TouchEvent('touchstart',{touches:[new Touch({identifier:1,target:element,clientX:12,clientY:200})],bubbles:true}));
    element.dispatchEvent(new TouchEvent('touchend',{changedTouches:[new Touch({identifier:1,target:element,clientX:170,clientY:205})],bubbles:true}));
  });
  await expect(page.getByRole('heading',{name:'Календарь'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'август 2026 г.'})).toBeVisible();
});

test('старая копия сохраняет подробности в свободном тексте',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Данные и резервная копия'}).click();
  const old={schemaVersion:1,appVersion:'0.1.0',exportedAt:new Date().toISOString(),programs:[],templates:[],settings:{id:'main',schemaVersion:2,lastExportAt:null,lastChangeAt:null},workouts:[{id:'old',date:'2026-09-22',title:'Старое занятие',goal:'Техника',duration:40,rpe:5,wristDuring:0,morning:{wrist:null,fingers:null,fatigue:null,note:''},exercises:[{id:'e',title:'Лазание',kind:'climb',plan:'План',climbs:[{name:'Красная',grade:'7A',result:'пройдено'}]}]}]};
  await page.locator('.settings-dialog input[type=file]').setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});
  await expect(page.getByText('1 старых подробных записей')).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Заменить данные этой копией'}).click();
  await page.getByRole('button',{name:'Закрыть'}).click();await dayCell(page).click();
  await expect(page.getByLabel('Лазание — что получилось')).toHaveValue(/Красная · 7A · пройдено/);
});
