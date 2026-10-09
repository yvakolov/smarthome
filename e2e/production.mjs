import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

// Verify the optimized artifact, its Pages base path and direct-route reloads.
const root = resolve('dist/smart-home/browser');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    if (!url.pathname.startsWith('/smarthome/')) { res.writeHead(404).end(); return; }
    const file = resolve(root, decodeURIComponent(url.pathname.slice('/smarthome/'.length)) || 'index.html');
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(4311, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
  await page.goto('http://127.0.0.1:4311/smarthome/#/projects');
  await expect(page.locator('#login')).toBeVisible();
  await page.locator('#login').fill('juralab');
  await page.locator('#password').fill('juralab');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/smarthome\/#\/projects$/);
  await page.getByRole('button', { name: 'Новый проект', exact: true }).click();
  await expect(page.locator('.konvajs-content canvas')).toBeVisible();
  assert.equal(await page.evaluate(() => 'smartHomeEditor' in window), false, 'No development handle in production');
  const projectUrl = page.url();
  await page.locator('#contourTool').click();
  await page.locator('#rectangleTool').click();
  await page.locator('#originY').press('Enter');
  await page.locator('#rectW').fill('10000');
  await page.locator('#rectW').press('Enter');
  await page.locator('#rectH').fill('8000');
  await page.locator('#rectH').press('Enter');
  await expect(page.locator('#rectAngle')).toBeFocused();
  await page.locator('#rectAngle').fill('45');
  await page.locator('#rectAngle').press('Enter');
  await expect(page.locator('#contourTool')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#commandHint')).toContainText('80');
  await page.locator('#save').click();
  await expect(page.locator('#saveProjectDialog')).toBeVisible();
  await page.locator('#projectName').fill('Дом 1');
  await page.locator('#projectName').press('Enter');
  await expect(page.locator('#saveProjectDialog')).toBeHidden();
  await expect(page.locator('#save')).toBeEnabled();
  await page.reload();
  await expect(page.locator('.konvajs-content canvas')).toBeVisible();
  await expect(page.locator('#commandHint')).toContainText('80');
  assert.equal(page.url(), projectUrl, 'Direct editor URL survives a reload');
  await mkdir('test-results/screenshots', { recursive: true });
  await page.screenshot({ path: 'test-results/screenshots/production-editor.png' });
  await page.getByRole('link', { name: 'Smart Home — к проектам' }).click();
  await expect(page.getByRole('button', { name: 'Открыть Дом 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Аккаунт', exact: true }).click();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.locator('#login')).toBeVisible();
  await page.goto(projectUrl);
  await expect(page.locator('#login')).toBeVisible();
  assert.deepEqual(errors, [], 'No uncaught production errors');
  console.log('PASS optimized artifact: authentication, Konva, rotated rectangle, save, direct-route reload, manager, logout');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
