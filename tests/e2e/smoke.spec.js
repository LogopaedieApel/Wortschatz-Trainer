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

test.describe('Editor Smoke', () => {
  let proc;
  const TEST_PORT = 3100;
  async function startServerIfNeeded(timeoutMs = 10_000) {
    if (await isPortInUse(TEST_PORT)) return;
    const spawnServer = () => {
      if (!proc || proc.killed) {
        proc = spawn(process.platform === 'win32' ? 'node.exe' : 'node', ['server.js'], {
          cwd: path.resolve(__dirname, '../..'),
          env: { ...process.env, PORT: String(TEST_PORT), EDITOR_READONLY: '1' },
          stdio: 'inherit'
        });
      }
    };
    spawnServer();
    try {
      await waitOnPort(TEST_PORT, timeoutMs);
    } catch (e) {
      // Retry einmal mit frischem Prozess
      try { if (proc && !proc.killed) proc.kill('SIGTERM'); } catch {}
      proc = null;
      await new Promise(r => setTimeout(r, 300));
      spawnServer();
      await waitOnPort(TEST_PORT, timeoutMs);
    }
    await new Promise(r => setTimeout(r, 250));
  }

  test.beforeAll(async () => {
    // Starte Server auf dediziertem Test-Port oder nutze laufenden
    await startServerIfNeeded(30_000);
    // kleine Pufferzeit, damit Static-Server bereit ist
    await new Promise(r => setTimeout(r, 400));
  });

  test.beforeEach(async () => {
    // Kurz prüfen/neu starten, falls der Server (zwischenzeitlich) beendet wurde
    await startServerIfNeeded(5_000);
  });

  test.afterAll(async () => {
    // Server nicht automatisch beenden, um Race-Conditions mit parallelen Workern zu vermeiden.
    // Optional: Nur beenden, wenn explizit gewünscht.
    if (process.env.E2E_KILL_SERVER === '1' && proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
  });

  test('Startseite lädt & RO-Banner sichtbar (falls eigener Test-Server)', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Wortschatz-Editor' })).toBeVisible();
    if (proc) {
      // Eigener Test-Server wurde mit EDITOR_READONLY=1 gestartet → Banner MUSS sichtbar sein
      await page.waitForSelector('#read-only-banner', { state: 'visible', timeout: 10000 });
      await expect(page.locator('#read-only-banner')).toBeVisible();
    } else {
      // Fremder Server läuft bereits → nur weich prüfen, dass Seite grundsätzlich funktioniert
      await expect(page.locator('#read-only-banner')).toHaveCount(1);
    }
  });

  test('Healthcheck-Button existiert', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html`, { waitUntil: 'domcontentloaded' });
    // Tools-Menü öffnen, damit die Menu-Items sichtbar sind
    await page.click('#tools-menu-button');
    await expect(page.locator('#tools-menu-button')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#run-healthcheck-button')).toBeVisible();
  });

  test('Backend-/Healthcheck-Verhalten', async ({ page }) => {
    const res = await page.request.get(`http://localhost:${TEST_PORT}/api/editor/config`);
    expect(res.ok()).toBeTruthy();
    const cfg = await res.json();
    if (proc) {
      // Eigener Test-Server: muss readOnly melden
      expect(cfg.readOnly).toBe(true);
    } else {
      // Bereits laufender Server: nicht erzwingen
      expect(typeof cfg.readOnly).toBe('boolean');
    }

    await page.goto(`http://localhost:${TEST_PORT}/editor.html`);
    // Tools-Menü öffnen und Healthcheck auslösen
    await page.click('#tools-menu-button');
    await expect(page.locator('#tools-menu-button')).toHaveAttribute('aria-expanded', 'true');
    const btn = page.locator('#run-healthcheck-button');
    await expect(btn).toBeVisible();
    await btn.click();
    // Heuristik: kein unhandled JS-Error → Test bleibt grün
  });

  test('Serverstatus-Badge zeigt Modus/Port', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html`, { waitUntil: 'domcontentloaded' });
    // Warte, bis der Client die Config geladen und das Badge aktualisiert hat
    const badgeText = page.locator('#server-status-text');
    await expect(badgeText).toBeVisible();
    if (proc) {
      await expect(badgeText).toHaveText(`RO @${TEST_PORT}`);
    } else {
      // Wenn ein fremder Server läuft, prüfen wir nur das Format
      await expect(badgeText).toHaveText(/^(RO|RW) @\d+$/);
    }
  });

  test('Hilfe-Modal öffnet und listet Dokumente', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html`, { waitUntil: 'domcontentloaded' });
    // Tools-Menü öffnen und Hilfe anklicken
    await page.click('#tools-menu-button');
    await expect(page.locator('#tools-menu-button')).toHaveAttribute('aria-expanded', 'true');
    const helpBtn = page.locator('#open-help-button');
    await expect(helpBtn).toBeVisible();
    await helpBtn.click();
    // Modal sichtbar und Liste gefüllt (mind. 1 Eintrag oder ein Hinweistext)
    await page.waitForSelector('#help-modal', { state: 'visible' });
    const list = page.locator('#help-docs-list li');
    await expect(await list.count()).toBeGreaterThan(0);
  });

  test('A11y-Attribute im Header vorhanden', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html`, { waitUntil: 'domcontentloaded' });
    // tools menu button hat aria-controls
    await expect(page.locator('#tools-menu-button')).toHaveAttribute('aria-controls', 'tools-menu');
    // status und notification haben role=status und aria-live=polite
    await expect(page.locator('#status-message')).toHaveAttribute('role', 'status');
    await expect(page.locator('#status-message')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#notification-area')).toHaveAttribute('role', 'status');
    await expect(page.locator('#notification-area')).toHaveAttribute('aria-live', 'polite');
  });

  test('Layout-Next-Badge sichtbar bei ?layout=next', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html?layout=next`, { waitUntil: 'domcontentloaded' });
    // Badge sollte sichtbar sein
    await page.waitForSelector('#layout-next-badge', { state: 'visible' });
    // Neue Container sichtbar, klassische Tabelle verborgen
    await expect(page.locator('#next-layout')).toBeVisible();
    await expect(page.locator('#table-wrapper')).toBeHidden();
  });

  test('Layout-Next-Badge verborgen bei ?layout=classic', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html?layout=classic`, { waitUntil: 'domcontentloaded' });
    // Badge sollte NICHT sichtbar sein
    const badge = page.locator('#layout-next-badge');
    await expect(badge).toBeHidden();
    // Klassische Tabelle sichtbar, Next-Container verborgen
    await expect(page.locator('#table-wrapper')).toBeVisible();
    await expect(page.locator('#next-layout')).toBeHidden();
  });

  test('Header-Wrapping: Suchfeld folgt auf Statusblock (DOM-Heuristik)', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html`, { waitUntil: 'domcontentloaded' });
    // Heuristik ohne Pixelmessung: search-input existiert und kommt im DOM nach status-message
    const status = page.locator('#status-message');
    const search = page.locator('#search-input');
    await expect(status).toHaveCount(1);
    await expect(search).toHaveCount(1);
    const orderOk = await page.evaluate(() => {
      const s = document.getElementById('status-message');
      const q = document.getElementById('search-input');
      if (!s || !q) return false;
      // Finde beide in der Dokumentreihenfolge
      const all = Array.from(document.querySelectorAll('body *'));
      const iS = all.indexOf(s);
      const iQ = all.indexOf(q);
      return iS >= 0 && iQ > iS;
    });
    expect(orderOk).toBe(true);
  });

  test('Layout-Next Sidebar-Filter zeigt "Keine Treffer" und erholt sich', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html?layout=next`, { waitUntil: 'domcontentloaded' });
    // Sidebar vorhanden
    await expect(page.locator('#next-layout')).toBeVisible();
    const search = page.locator('#next-sidebar-search');
    await expect(search).toBeVisible();
    // Unsinnige Suche
    await search.fill('zzzzzzzzzz___unlikely');
  const emptyMsg = page.locator('#next-list', { hasText: 'Keine Treffer' });
    await expect(emptyMsg).toBeVisible();
    // Zurücksetzen
    await search.fill('');
    // Liste sollte wieder Einträge enthalten (oder wenigstens nicht die leere Meldung zeigen)
    await expect(page.locator('#next-list')).not.toContainText('Keine Treffer');
  });

  test('Layout-Next: Genau eine Listbox vorhanden (UL)', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html?layout=next`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#next-layout')).toBeVisible();
    const listboxes = page.locator('#next-layout [role="listbox"]');
    await expect(listboxes).toHaveCount(1);
    // Und sie ist eine UL innerhalb von #next-list
    const ul = page.locator('#next-list ul[role="listbox"]');
    await expect(ul).toHaveCount(1);
  });

  test('Layout-Next: Klick auf Sidebar-Eintrag zeigt Details', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html?layout=next`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#next-layout')).toBeVisible();
    // Finde den ersten anklickbaren Eintrag
    const firstLink = page.locator('#next-list a[data-item-id]').first();
    await expect(firstLink).toBeVisible();
    const itemId = await firstLink.getAttribute('data-item-id');
    const itemName = await firstLink.textContent();
    // Vor Klick: Liste vorhanden
    const listbox = page.locator('#next-list ul[role="listbox"]');
    await expect(listbox).toBeVisible();
    await firstLink.click();
    // Detailbereich sollte Name und ID enthalten
    const main = page.locator('#next-main');
    await expect(main).toBeVisible();
    await expect(main).toContainText(itemName || '');
    if (itemId) {
      await expect(main).toContainText(itemId);
      // A11y: aria-activedescendant zeigt auf das LI des geklickten Eintrags
      const activeDescId = await listbox.getAttribute('aria-activedescendant');
      expect(activeDescId).toBeTruthy();
      const activeLi = page.locator(`#${activeDescId}`);
      await expect(activeLi).toBeVisible();
    }
  });

  test('Layout-Next: Details-Platzhalter vor Auswahl', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html?layout=next`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#next-layout')).toBeVisible();
    const main = page.locator('#next-main');
    await expect(main).toBeVisible();
  // Vor Auswahl wird ein Platzhalter angezeigt (Überschrift + Hinweistext)
  await expect(page.locator('#next-details-title')).toBeVisible();
  await expect(page.locator('#next-details-title')).toHaveText(/Neue Ansicht \(Beta\)/);
  await expect(main).toContainText('Inhalte folgen.');
    // Nach Auswahl eines Eintrags verschwindet der Platzhalter und Details erscheinen
    const firstLink = page.locator('#next-list a[data-item-id]').first();
    await expect(firstLink).toBeVisible();
    const itemId = await firstLink.getAttribute('data-item-id');
    const itemName = await firstLink.textContent();
    await firstLink.click();
  // Platzhalter verschwindet (Titel ändert sich, Hinweistext ist weg)
  await expect(page.locator('#next-details-title')).not.toHaveText(/Neue Ansicht \(Beta\)/);
  await expect(main).not.toContainText('Inhalte folgen.');
    if (itemName) await expect(main).toContainText(itemName);
    if (itemId) await expect(main).toContainText(itemId);
  });

  test('Layout-Next: Tastatur-Navigation (ArrowDown/Enter)', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html?layout=next`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#next-layout')).toBeVisible();
    const search = page.locator('#next-sidebar-search');
    await expect(search).toBeVisible();
    // Fokus auf Suche, dann mit ArrowDown ersten Eintrag auswählen
    // Warte, bis die Liste gerendert ist
    await page.waitForSelector('#next-list a[data-item-id]', { state: 'visible' });
    await search.focus();
    await page.keyboard.press('ArrowDown');
  const selectedLink = page.locator('#next-list li[role="option"][aria-selected="true"] a[data-item-id]').first();
  await expect(selectedLink).toBeVisible();
  // A11y: aria-activedescendant auf der Listbox verweist auf das aktive LI
  const listbox = page.locator('#next-list ul[role="listbox"]');
  await expect(listbox).toBeVisible();
  const activeDesc = await listbox.getAttribute('aria-activedescendant');
  expect(activeDesc).toBeTruthy();
  const liWithId = page.locator(`#${activeDesc}`);
  await expect(liWithId).toBeVisible();
  const itemId = await selectedLink.getAttribute('data-item-id');
  const itemName = await selectedLink.textContent();
    // Enter öffnet Details
    await page.keyboard.press('Enter');
    const main = page.locator('#next-main');
    await expect(main).toBeVisible();
    if (itemName) await expect(main).toContainText(itemName);
    if (itemId) await expect(main).toContainText(itemId);
  });

  test('Layout-Next: Ausgewählter Sidebar-Eintrag hat aktiven Stil', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html?layout=next`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#next-layout')).toBeVisible();
    const search = page.locator('#next-sidebar-search');
    await expect(search).toBeVisible();
    // Warte bis Einträge gerendert sind
    await page.waitForSelector('#next-list a[data-item-id]', { state: 'visible' });
    // Per Tastatur den ersten Eintrag auswählen (setzt aria-selected=true)
    await search.focus();
    await page.keyboard.press('ArrowDown');
    const selectedLink = page.locator('#next-list li[role="option"][aria-selected="true"] a[data-item-id]').first();
    await expect(selectedLink).toBeVisible();
    // Visuelle Prüfung: dezente Hervorhebung aktiv
    const styles = await selectedLink.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        backgroundColor: cs.backgroundColor,
        borderTopColor: cs.borderTopColor,
        color: cs.color,
      };
    });
    expect(styles.backgroundColor).toBe('rgb(232, 240, 255)'); // #e8f0ff
    expect(styles.borderTopColor).toBe('rgb(125, 166, 255)'); // var(--color-primary) = #7da6ff
    expect(styles.color).toBe('rgb(26, 61, 143)'); // var(--color-primary-ink) = #1a3d8f
  });

  test('Layout-Next: Tastatur Home/End springt zu erstem/letztem', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html?layout=next`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#next-layout')).toBeVisible();
    const search = page.locator('#next-sidebar-search');
    await expect(search).toBeVisible();
    // Zuerst Liste sicher befüllen lassen
    // Warte bis mindestens ein Eintrag gerendert wurde
    await page.waitForSelector('#next-list a[data-item-id]', { state: 'visible' });
    await search.focus();
    await page.keyboard.press('ArrowDown'); // erste Auswahl
    const firstLink = page.locator('#next-list a[data-item-id]').first();
    const lastLink = page.locator('#next-list a[data-item-id]').last();
    await expect(firstLink).toBeVisible();
    await expect(lastLink).toBeVisible();

    // End → letzter Eintrag fokussiert und ausgewählt
    await page.keyboard.press('End');
    await expect(lastLink).toBeFocused();
    const selLast = page.locator('#next-list li[role="option"][aria-selected="true"] a[data-item-id]').last();
    await expect(selLast).toBeVisible();
    await expect(selLast).toHaveAttribute('data-item-id', await lastLink.getAttribute('data-item-id'));

    // Home → erster Eintrag fokussiert und ausgewählt
    await page.keyboard.press('Home');
    await expect(firstLink).toBeFocused();
    const selFirst = page.locator('#next-list li[role="option"][aria-selected="true"] a[data-item-id]').first();
    await expect(selFirst).toBeVisible();
    await expect(selFirst).toHaveAttribute('data-item-id', await firstLink.getAttribute('data-item-id'));
  });

  test('Layout-Next: Filter ohne Treffer entfernt Auswahl/activedescendant', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html?layout=next`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#next-layout')).toBeVisible();
    const search = page.locator('#next-sidebar-search');
    await expect(search).toBeVisible();
    // Warte auf initiale Liste
    await page.waitForSelector('#next-list a[data-item-id]', { state: 'visible' });
    // Wähle ersten Eintrag per Tastatur aus
    await search.focus();
    await page.keyboard.press('ArrowDown');
    const listbox = page.locator('#next-list ul[role="listbox"]');
    await expect(listbox).toBeVisible();
    const selectedBefore = page.locator('#next-list li[role="option"][aria-selected="true"] a[data-item-id]').first();
    await expect(selectedBefore).toBeVisible();
    const activeDescBefore = await listbox.getAttribute('aria-activedescendant');
    expect(activeDescBefore).toBeTruthy();
    // Filter so setzen, dass keine Treffer erscheinen
    await search.fill('___no_results_expected____');
    await expect(page.locator('#next-list', { hasText: 'Keine Treffer' })).toBeVisible();
    // Listbox ist entfernt, folglich kein activedescendant mehr vorhanden
    await expect(page.locator('#next-list ul[role="listbox"]')).toHaveCount(0);
    // Filter wieder leeren → Liste erscheint, aber ohne aktive Auswahl
    await search.fill('');
    await page.waitForSelector('#next-list a[data-item-id]', { state: 'visible' });
    const listboxAfter = page.locator('#next-list ul[role="listbox"]');
    await expect(listboxAfter).toBeVisible();
    await expect(page.locator('#next-list li[role="option"][aria-selected="true"]')).toHaveCount(0);
    const activeDescAfter = await listboxAfter.getAttribute('aria-activedescendant');
    expect(activeDescAfter === null || activeDescAfter === '').toBeTruthy();
  });

  test("Layout-Next: '/' fokussiert Suche, Escape leert Filter", async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html?layout=next`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#next-layout')).toBeVisible();
    const search = page.locator('#next-sidebar-search');
    await expect(search).toBeVisible();
    // Stelle sicher, dass zunächst etwas anderes fokussiert ist (z. B. Body)
    await page.locator('body').click();
    // '/' → Suche bekommt Fokus und der Text wird selektiert
    await page.keyboard.press('/');
    await expect(search).toBeFocused();
    // Setze einen Filter und prüfe, dass die Liste gefiltert wird
    await search.fill('sch');
    await expect(page.locator('#next-list')).not.toContainText('Keine Treffer');
    // Escape → Filter wird geleert (Liste wird neu gerendert)
    await page.keyboard.press('Escape');
    await expect(search).toHaveValue('');
    await page.waitForSelector('#next-list a[data-item-id]', { state: 'visible' });
    // Zweites Escape → Fokus verlässt die Suche
    await page.keyboard.press('Escape');
    await expect(search).not.toBeFocused();
  });

  test('Layout-Next: Details zeigen Anzahl der Listen', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html?layout=next`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#next-layout')).toBeVisible();
    // Ersten Eintrag auswählen
    const firstLink = page.locator('#next-list a[data-item-id]').first();
    await expect(firstLink).toBeVisible();
    const itemId = await firstLink.getAttribute('data-item-id');
    await firstLink.click();
    // Details müssen die Listenanzahl enthalten
    const setsInfo = page.locator('#next-main [data-testid="details-sets-count"]');
    await expect(setsInfo).toBeVisible();
    const text = await setsInfo.textContent();
    expect(text).toMatch(/^Listen: \d+$/);
  });

  test('Layout-Next: Space öffnet Details wie Enter', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html?layout=next`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#next-layout')).toBeVisible();
    const search = page.locator('#next-sidebar-search');
    await expect(search).toBeVisible();
    await page.waitForSelector('#next-list a[data-item-id]', { state: 'visible' });
    await search.focus();
    await page.keyboard.press('ArrowDown');
    const selectedLink = page.locator('#next-list li[role="option"][aria-selected="true"] a[data-item-id]').first();
    const itemId = await selectedLink.getAttribute('data-item-id');
    const itemName = await selectedLink.textContent();
    // Space drücken
    await page.keyboard.press(' ');
    const main = page.locator('#next-main');
    await expect(main).toBeVisible();
    if (itemName) await expect(main).toContainText(itemName);
    if (itemId) await expect(main).toContainText(itemId);
  });

  test('Layout-Next: Enter im Suchfeld öffnet erstes/ausgewähltes Ergebnis', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html?layout=next`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#next-layout')).toBeVisible();
    const search = page.locator('#next-sidebar-search');
    await expect(search).toBeVisible();
    // Warte bis initiale Liste gerendert wurde
    await page.waitForSelector('#next-list a[data-item-id]', { state: 'visible' });
    // 1) Ohne Vorauswahl: Enter öffnet erstes Ergebnis
    await search.focus();
    await page.keyboard.press('Enter');
    const firstLink = page.locator('#next-list a[data-item-id]').first();
    const firstId = await firstLink.getAttribute('data-item-id');
    const firstName = await firstLink.textContent();
    const main = page.locator('#next-main');
    await expect(main).toBeVisible();
    if (firstName) await expect(main).toContainText(firstName);
    if (firstId) await expect(main).toContainText(firstId);

    // 2) Mit Vorauswahl (ArrowDown): Enter öffnet ausgewähltes Ergebnis, nicht zwingend das erste
    await search.focus();
    // Liste ist gerendert, mit ArrowDown Auswahl setzen
    await page.keyboard.press('ArrowDown');
    const selectedLink = page.locator('#next-list li[role="option"][aria-selected="true"] a[data-item-id]').first();
    const selId = await selectedLink.getAttribute('data-item-id');
    const selName = await selectedLink.textContent();
    await page.keyboard.press('Enter');
    await expect(main).toBeVisible();
    if (selName) await expect(main).toContainText(selName);
    if (selId) await expect(main).toContainText(selId);
  });

  test('Layout-Next: Details-Bereich hat aria-live="polite"', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html?layout=next`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#next-layout')).toBeVisible();
    const main = page.locator('#next-main');
    await expect(main).toBeVisible();
    await expect(main).toHaveAttribute('aria-live', 'polite');
    // optional: Änderung auslösen und sicherstellen, dass der Bereich weiterhin sichtbar ist
    const firstLink = page.locator('#next-list a[data-item-id]').first();
    await expect(firstLink).toBeVisible();
    await firstLink.click();
    await expect(main).toBeVisible();
  });

  test('Layout-Next: Suche ist beschriftet und steuert Liste', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html?layout=next`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#next-layout')).toBeVisible();
    const search = page.locator('#next-sidebar-search');
    await expect(search).toBeVisible();
    await expect(search).toHaveAttribute('aria-label', 'Einträge durchsuchen');
    await expect(search).toHaveAttribute('aria-controls', 'next-list');
  });

  test('Layout-Next: Details-Bereich ist per Überschrift beschriftet (aria-labelledby)', async ({ page }) => {
    await page.goto(`http://localhost:${TEST_PORT}/editor.html?layout=next`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#next-layout')).toBeVisible();
    const main = page.locator('#next-main');
    await expect(main).toBeVisible();
    // initial: verweist auf Platzhalter-Titel
    await expect(main).toHaveAttribute('aria-labelledby', 'next-details-title');
    await expect(page.locator('#next-details-title')).toBeVisible();
    // Auswahl treffen → Überschrift wird dynamisch auf Item-Name gesetzt und bleibt die Beschriftung
    const firstLink = page.locator('#next-list a[data-item-id]').first();
    const nameBefore = await firstLink.textContent();
    await firstLink.click();
    const heading = page.locator('#next-details-title');
    await expect(heading).toBeVisible();
    if (nameBefore) await expect(heading).toHaveText(nameBefore);
    await expect(main).toHaveAttribute('aria-labelledby', 'next-details-title');
  });
});
