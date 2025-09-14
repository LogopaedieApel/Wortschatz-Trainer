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
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wst-idrename-'));
  dataDir = path.join(tmpDir, 'data');
  stateDir = path.join(tmpDir, 'state');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  // Seed DB + sets
  await writeJson(path.join(dataDir, 'items_database.json'), {
    lamm: { name: 'Lamm', image: '', sound: '', folder: 'l' }
  });
  await writeJson(path.join(dataDir, 'sets.json'), {
    test: { displayName: 'Test', list: { displayName: 'Liste', path: 'data/sets/testliste.json' } }
  });
  await writeJson(path.join(dataDir, 'sets', 'testliste.json'), ['lamm', 'lamm']);

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

it('dry-run zeigt Diffs und geplante Set-Updates', async () => {
  const res = await agent.post('/api/editor/item/id-rename').send({ mode: 'woerter', oldId: 'lamm', newId: 'schaf', dryRun: true });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(res.body.diffs.database).toEqual({ from: 'lamm', to: 'schaf' });
  const setPaths = res.body.updatedSets || [];
  expect(setPaths.some(p => p.endsWith('data/sets/testliste.json'))).toBe(true);
});

it('apply verschiebt DB-Key und dedupliziert in Sets', async () => {
  const res = await agent.post('/api/editor/item/id-rename').send({ mode: 'woerter', oldId: 'lamm', newId: 'schaf', dryRun: false });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);

  // DB prüfen
  const db = JSON.parse(await fsp.readFile(path.join(dataDir, 'items_database.json'), 'utf8'));
  expect(db.lamm).toBeUndefined();
  expect(db.schaf).toBeTruthy();
  expect(db.schaf.name).toBe('Lamm');

  // Set-Datei prüfen (dedupliziert, nur einmal schaf)
  const arr = JSON.parse(await fsp.readFile(path.join(dataDir, 'sets', 'testliste.json'), 'utf8'));
  expect(arr.filter(x => x === 'schaf').length).toBe(1);
  expect(arr.includes('lamm')).toBe(false);
});
