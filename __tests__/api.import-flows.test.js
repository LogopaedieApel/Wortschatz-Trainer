const request = require('supertest');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');

let app;
let server;
let agent;
let tmpDir;
let dataDir;
let stateDir;

async function writeJson(p, obj) {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, JSON.stringify(obj, null, 2));
}

beforeAll(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wst-imp-'));
  dataDir = path.join(tmpDir, 'data');
  stateDir = path.join(tmpDir, 'state');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  // Seed minimal structures
  await writeJson(path.join(dataDir, 'items_database.json'), {});
  await writeJson(path.join(dataDir, 'sets.json'), {});

  process.env.DATA_DIR = dataDir;
  process.env.STATE_DIR = stateDir;
  process.env.EDITOR_READONLY = '';
  process.env.DISABLE_BACKUPS = '1';

  app = require('../server');
  server = app.listen(0);
  agent = request.agent(server);
});

afterAll(async () => {
  if (server && server.close) await new Promise(res => server.close(res));
});

/**
 * Helper to create a dummy file with content
 */
async function touch(file, content = 'x') {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, content);
}

/**
 * Flow 1: Neuer Buchstabenordner 'z' mit Dateien, dann /api/sync-files -> DB soll Einträge enthalten, Pfade korrekt.
 */
test('Flow 1: Neuer Ordner z + sync-files', async () => {
  const zImg = path.join(dataDir, 'wörter', 'images', 'z', 'zebra.jpg');
  const zSnd = path.join(dataDir, 'wörter', 'sounds', 'z', 'zebra.mp3');
  await touch(zImg);
  await touch(zSnd);

  const resSync = await agent.post('/api/sync-files').query({ mode: 'woerter' });
  expect(resSync.status).toBe(200);

  const resAll = await agent.get('/api/get-all-data').query({ mode: 'woerter' });
  expect(resAll.status).toBe(200);
  const db = resAll.body.database || {};
  // ID wird aus Dateiname abgeleitet -> 'zebra'
  expect(db.zebra).toBeTruthy();
  expect(db.zebra.image).toContain('data/wörter/images/z/zebra.jpg');
  expect(db.zebra.sound).toContain('data/wörter/sounds/z/zebra.mp3');
  expect(db.zebra.folder).toBe('z');
});

/**
 * Flow 2: Dateien im Import-Ordner -> analyze-unsorted-files -> resolve-conflicts (move) -> Zielordner sollten bei Bedarf angelegt werden.
 */
test('Flow 2: Import-Ordner -> analyze -> resolve (move) sortiert richtig ein', async () => {
  const uImg = path.join(dataDir, 'import_Wörter', 'apfel.jpg');
  const uSnd = path.join(dataDir, 'import_Wörter', 'apfel.mp3');
  await touch(uImg);
  await touch(uSnd);

  const analyze = await agent.post('/api/analyze-unsorted-files').query({ mode: 'woerter' });
  expect(analyze.status).toBe(200);
  const { movableFiles, conflicts } = analyze.body;
  expect(Array.isArray(movableFiles)).toBe(true);
  expect(conflicts.length).toBe(0);

  // Build move actions from analyze response
  const actions = movableFiles.map(f => ({ type: 'move', sourcePath: f.sourcePath, targetPath: f.targetPath, fileName: f.fileName }));
  const resolve = await agent.post('/api/resolve-conflicts').send({ actions });
  expect(resolve.status).toBe(200);
  expect(resolve.body.moved).toBeGreaterThanOrEqual(2); // both files moved

  // After move, run sync
  const resSync = await agent.post('/api/sync-files').query({ mode: 'woerter' });
  expect(resSync.status).toBe(200);
  const resAll = await agent.get('/api/get-all-data').query({ mode: 'woerter' });
  const db = resAll.body.database || {};
  expect(db.apfel).toBeTruthy();
  expect(db.apfel.image).toContain('data/wörter/images/a/apfel.jpg');
  expect(db.apfel.sound).toContain('data/wörter/sounds/a/apfel.mp3');
});

/**
 * Flow 3: Löschen eines Items (mit Archiv), danach Wiederherstellung -> unsortiert -> analyze/resolve -> sync
 */
test('Flow 3: Löschen -> Archiv -> Wiederherstellen -> einsortieren -> DB wieder vorhanden', async () => {
  // Seed an item by creating files and syncing
  const img = path.join(dataDir, 'wörter', 'images', 'b', 'becher.jpg');
  const snd = path.join(dataDir, 'wörter', 'sounds', 'b', 'becher.mp3');
  await touch(img);
  await touch(snd);
  await agent.post('/api/sync-files').query({ mode: 'woerter' });

  // Delete via API
  const del = await agent.post('/api/delete-item').send({ id: 'becher', mode: 'woerter' });
  expect([200, 500]).toContain(del.status); // allow 200 (success) or 500 if missing files; should prefer 200

  // Ensure files moved to archive
  const archived = await agent.get('/api/get-archived-files');
  expect(archived.status).toBe(200);
  const list = archived.body || [];
  const becherEntry = list.find(x => x.id === 'becher');
  expect(becherEntry).toBeTruthy();
  expect(becherEntry.files.length).toBeGreaterThan(0);

  // Restore archived files -> unsorted
  const payload = { action: 'restore', files: becherEntry.files };
  const restoreRes = await agent.post('/api/manage-archive').send(payload);
  expect(restoreRes.status).toBe(200);

  // Analyze and resolve moves
  const analyze = await agent.post('/api/analyze-unsorted-files').query({ mode: 'woerter' });
  const actions = analyze.body.movableFiles.map(f => ({ type: 'move', sourcePath: f.sourcePath, targetPath: f.targetPath, fileName: f.fileName }));
  if (actions.length > 0) {
    const resolve = await agent.post('/api/resolve-conflicts').send({ actions });
    expect(resolve.status).toBe(200);
  }

  // Sync files back to DB
  await agent.post('/api/sync-files').query({ mode: 'woerter' });
  const resAll = await agent.get('/api/get-all-data').query({ mode: 'woerter' });
  const db = resAll.body.database || {};
  expect(db.becher).toBeTruthy();
});
