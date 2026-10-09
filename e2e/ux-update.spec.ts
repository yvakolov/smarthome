import { test, expect, Page } from '@playwright/test';

async function state(page: Page) {
  await page.waitForFunction(() => !!(window as any).smartHomeEditor);
  return page.evaluate(() => (window as any).smartHomeEditor.getState());
}
async function login(page: Page) {
  await page.goto('/');
  await page.locator('#login').fill('juralab');
  await page.locator('#password').fill('juralab');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.locator('.project-grid')).toBeVisible();
}
async function project(page: Page) {
  await login(page);
  await page.getByRole('button', { name: 'Новый проект', exact: true }).click();
  await state(page);
}
async function footprint(page: Page) {
  await page.locator('#contourTool').click();
  await page.locator('#graphicalTool').click();
  await page.locator('#originY').press('Enter');
  for (const [key, value] of [['ArrowRight','10000'],['ArrowUp','8000'],['ArrowLeft','10000']]) {
    await page.keyboard.press(key);await page.locator('#lineLength').fill(value);await page.locator('#lineLength').press('Enter');
  }
  await page.keyboard.press('c');
}
async function clickWorld(page: Page, x: number, y: number, right = false) {
  await expect.poll(async () => { const s=await state(page),b=await page.locator('#canvas').boundingBox();return Math.abs(s.w-b!.width); }).toBeLessThan(1);
  const s=await state(page), b=await page.locator('#canvas').boundingBox();
  await page.mouse.click(b!.x+s.ox+x*s.scale,b!.y+s.oy-y*s.scale,{button:right?'right':'left'});
}
async function firstSave(page: Page, name: string) {
  await page.locator('#save').click();await expect(page.locator('#saveProjectDialog')).toBeVisible();
  await page.locator('#projectName').fill(name);await page.locator('#projectName').press('Enter');
  await expect(page.locator('#saveProjectDialog')).toBeHidden();await expect(page.locator('#save')).toBeEnabled();
}
async function databaseProjects(page: Page) {
  return page.evaluate(() => new Promise<any[]>((resolve,reject) => {
    const request=indexedDB.open('smart-home',1);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const db=request.result,tx=db.transaction('projects','readonly'),q=tx.objectStore('projects').getAll();let records:any[]=[];
      q.onsuccess=()=>records=q.result;tx.oncomplete=()=>{db.close();resolve(records);};tx.onabort=()=>{db.close();reject(tx.error);};};
  }));
}
async function centered(page: Page, selector: string) {
  const box=await page.locator(selector).boundingBox(),view=page.viewportSize()!;
  expect(Math.abs(box!.x+box!.width/2-view.width/2)).toBeLessThan(1.1);
  expect(Math.abs(box!.y+box!.height/2-view.height/2)).toBeLessThan(1.1);
}

for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
  test(`login and modal Card are centered at ${viewport.width}`,async({page})=>{
    await page.setViewportSize(viewport);await page.goto('/');await centered(page,'.login-card');await project(page);
    await page.locator('#contourTool').click();await centered(page,'#methodDialog');
    for(const slot of ['card-header','card-content','card-footer'])await expect(page.locator(`#methodDialog [data-slot="${slot}"]`)).toHaveCount(1);
  });
}
test('unsaved draft is not listed and has no IndexedDB record',async({page})=>{
  await project(page);await footprint(page);expect(await databaseProjects(page)).toHaveLength(0);
  await page.getByRole('link',{name:'Smart Home — к проектам'}).click();await expect(page.locator('.project-card')).toHaveCount(0);
});
test('cancel first save does not create a card or database record',async({page})=>{
  await project(page);await footprint(page);await page.locator('#save').click();await page.locator('#saveProjectDialog').getByRole('button',{name:'Отмена',exact:true}).click();
  expect(await databaseProjects(page)).toHaveLength(0);expect((await state(page)).dirty).toBe(true);
});
test('real IndexedDB retains named project, contour color and geometry after reload',async({page})=>{
  await project(page);await footprint(page);const url=page.url();await clickWorld(page,5000,4000);
  await page.locator('#inspectorName').fill('Дом');await page.locator('#inspectorColor').fill('#397ad6');
  await page.getByRole('button',{name:'Применить',exact:true}).click();await firstSave(page,'Дом Екатерины');
  const records=await databaseProjects(page);expect(records).toHaveLength(1);expect(records[0].name).toBe('Дом Екатерины');expect(records[0].contours[0].color).toBe('#397ad6');
  await page.reload();expect((await state(page)).contours[0].color).toBe('#397ad6');expect((await state(page)).area).toBe(80);expect(page.url()).toBe(url);
  await page.getByRole('link',{name:'Smart Home — к проектам'}).click();await page.getByRole('button',{name:'Открыть Дом Екатерины',exact:true}).click();
  expect((await state(page)).contours[0].name).toBe('Дом');expect((await state(page)).active).toBe(false);
  await page.locator('#save').click();await expect(page.locator('#saveProjectDialog')).toBeHidden();await expect(page.locator('#save')).toBeEnabled();expect(await databaseProjects(page)).toHaveLength(1);
});
test('inspector bounds, keyboard resize and metadata-only editing',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await project(page);await footprint(page);await clickWorld(page,5000,4000);
  const inspector=page.locator('sh-contour-inspector');await expect(inspector).toBeVisible();expect((await inspector.boundingBox())!.width).toBeCloseTo(240,0);
  const resize=page.getByRole('separator',{name:'Изменить ширину инспектора'});await resize.press('End');await expect.poll(async()=>(await inspector.boundingBox())!.width).toBeCloseTo(432,0);
  await expect(page.locator('#inspectorWidth')).toHaveCount(0);
  await expect(page.locator('#inspectorAngle')).toHaveCount(0);
  await page.locator('#inspectorName').fill('Гараж');await page.getByRole('button',{name:'Применить',exact:true}).click();
  expect((await state(page)).area).toBeCloseTo(80,6);expect((await state(page)).contours[0].name).toBe('Гараж');
});
test('context menu delete and undo',async({page})=>{
  await project(page);await footprint(page);await clickWorld(page,5000,4000,true);await expect(page.locator('sh-contour-menu [role=menuitem]')).toHaveCount(5);
  await page.getByRole('menuitem',{name:'Удалить',exact:true}).click();expect((await state(page)).contours).toHaveLength(0);await page.locator('#undo').click();expect((await state(page)).contours).toHaveLength(1);
});
test('duplicate commits only after a target confirmation',async({page})=>{
  await project(page);await footprint(page);await clickWorld(page,5000,4000,true);await page.getByRole('menuitem',{name:'Дублировать',exact:true}).click();
  await clickWorld(page,0,0);await page.keyboard.press('ArrowRight');await page.locator('#operationDistance').fill('15000');expect((await state(page)).contours).toHaveLength(1);
  await page.locator('#operationDistance').press('Enter');const s=await state(page);expect(s.contours).toHaveLength(2);expect(s.contours[0].points[0]).toEqual({x:0,y:0});expect(s.contours[1].points[0]).toEqual({x:15000,y:0});
});
test('rotation step does not finish the operation and exact angle preserves area',async({page})=>{
  await project(page);await footprint(page);await clickWorld(page,5000,4000,true);await page.getByRole('menuitem',{name:'Повернуть',exact:true}).click();await clickWorld(page,0,0);
  await page.locator('#angleStep').fill('15');await page.locator('#angleStep').press('Enter');expect((await state(page)).operation.kind).toBe('rotate');
  await page.locator('#operationAngle').fill('22.5');await page.locator('#operationAngle').press('Enter');expect((await state(page)).area).toBeCloseTo(80,6);
});
