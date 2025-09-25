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

async function isPortInUse(port) {
  return new Promise(resolve => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.end(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

test.describe('Patienten‑Startseite', () => {
  let proc;
  const TEST_PORT = 3100;

  async function startServerIfNeeded(timeoutMs = 10_000) {
    if (await isPortInUse(TEST_PORT)) return;
    const spawnServer = () => {
      if (!proc || proc.killed) {
        proc = spawn(process.platform === 'win32' ? 'node.exe' : 'node', ['server.js'], {
          cwd: path.resolve(__dirname, '../..'),
          env: { ...process.env, PORT: String(TEST_PORT) },
          stdio: 'inherit'
        });
      }
    };
    spawnServer();
    try {
      await waitOnPort(TEST_PORT, timeoutMs);
    } catch (e) {
      try { if (proc && !proc.killed) proc.kill('SIGTERM'); } catch {}
      proc = null;
      await new Promise(r => setTimeout(r, 300));
      spawnServer();
      await waitOnPort(TEST_PORT, timeoutMs);
    }
    await new Promise(r => setTimeout(r, 250));
  }

  test.beforeAll(async () => {
    await startServerIfNeeded(30_000);
    await new Promise(r => setTimeout(r, 400));
  });

  test.beforeEach(async () => {
    await startServerIfNeeded(5_000);
  });

  test('Consent steuert Start und Redirect zu index.html übernimmt Parameter', async ({ page }) => {
    const url = `http://localhost:${TEST_PORT}/patient.html?mode=quiz&material=woerter&set=artikulation_b_initial&pid=p123&aid=a456&title=Probe`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Titel sichtbar (kommt aus ?title=...)
  await expect(page.locator('#title')).toHaveText('Probe');

  // Consent ist jetzt im Menü: Menü öffnen, Consent setzen, Menü schließen
  await page.click('#menu-toggle');
  await page.check('#consent');
  await page.click('#menu-done');
  // Übung 1 anklicken → Redirect zu index.html mit übernommenen Parametern und autostart/uiLock
  const firstExercise = page.locator('.set-button').first();
  await expect(firstExercise).toBeVisible();
  const waitNav = page.waitForURL(u => /\/index\.html(\?|$)/.test(new URL(u).pathname), { timeout: 10000 });
  await firstExercise.click();
    await waitNav;

    const dest = new URL(page.url());
    expect(dest.pathname.endsWith('/index.html')).toBeTruthy();
    const sp = dest.searchParams;
    expect(sp.get('mode')).toBe('quiz');
    expect(sp.get('material')).toBe('woerter');
    // entweder set oder sets (hier: set)
    expect(sp.get('set')).toBe('artikulation_b_initial');
    expect(sp.get('autostart')).toBe('1');
    expect(sp.get('uiLock')).toBe('1');
    expect(sp.get('pid')).toBe('p123');
    expect(sp.get('aid')).toBe('a456');
  });
});
