import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import path from 'path';
import net from 'net';

async function waitOnPort(port: number, timeoutMs = 10_000) {
  const start = Date.now();
  return new Promise<void>((resolve, reject) => {
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
  let proc: any;

  test.beforeAll(async () => {
    // Start server on 3000
    proc = spawn(process.platform === 'win32' ? 'node.exe' : 'node', ['server.js'], {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, PORT: '3000', EDITOR_READONLY: '1' },
      stdio: 'inherit'
    });
    await waitOnPort(3000, 15_000);
  });

  test.afterAll(async () => {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
  });

  test('Startseite lädt & RO-Badge sichtbar', async ({ page }) => {
    await page.goto('/editor.html');
    await expect(page.locator('h1', { hasText: 'Wortschatz-Editor' })).toBeVisible();
    // RO-Badge/Banner sichtbar oder config sagt readOnly=true
    const badge = page.locator('#read-only-banner');
    await expect(badge).toBeVisible();
  });

  test('Healthcheck-Button existiert', async ({ page }) => {
    await page.goto('/editor.html');
    await expect(page.locator('#run-healthcheck-button')).toBeVisible();
  });
});
