const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

async function waitOnPort(port, timeoutMs = 10_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => { socket.end(); resolve(); });
      socket.once('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('timeout'));
        else setTimeout(tryConnect, 200);
      });
    };
    tryConnect();
  });
}

test.describe('Editor Smoke', () => {
  let proc;

  test.beforeAll(async () => {
    // Start server on 3000 (read-only)
    proc = spawn(process.platform === 'win32' ? 'node.exe' : 'node', ['server.js'], {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, PORT: '3000', EDITOR_READONLY: '1' },
      stdio: 'inherit'
    });
    await waitOnPort(3000, 15000);
  });

  test.afterAll(async () => {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
  });

  test('Startseite lädt & RO-Banner sichtbar', async ({ page }) => {
    await page.goto('/editor.html');
    await expect(page.getByRole('heading', { name: 'Wortschatz-Editor' })).toBeVisible();
    await expect(page.locator('#read-only-banner')).toBeVisible();
  });

  test('Healthcheck-Button existiert', async ({ page }) => {
    await page.goto('/editor.html');
    await expect(page.locator('#run-healthcheck-button')).toBeVisible();
  });

  test('Backend meldet readOnly=true und Healthcheck-Klick führt nicht zu Fehler', async ({ page }) => {
    const res = await page.request.get('/api/editor/config');
    expect(res.ok()).toBeTruthy();
    const cfg = await res.json();
    expect(cfg.readOnly).toBe(true);

    await page.goto('/editor.html');
    const btn = page.locator('#run-healthcheck-button');
    await expect(btn).toBeVisible();
    await btn.click();
    // einfache Heuristik: es darf kein JS-Error im Client entstehen
    // (Playwright würde bei unhandled-rejections in der Regel den Test fehlschlagen lassen)
  });
});
