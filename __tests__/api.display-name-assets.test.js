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
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wst-dn-'));
  dataDir = path.join(tmpDir, 'data');
  stateDir = path.join(tmpDir, 'state');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  // Seed DB with one item that has paths but no files yet
  await writeJson(path.join(dataDir, 'items_database.json'), {
    loeschen: {
      name: 'Löschen',
      image: 'data/wörter/images/l/Löschen.jpg',
      sound: 'data/wörter/sounds/l/Löschen.mp3',
      folder: 'l'
    }
  });
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

test('PATCH display-name 409 when assets missing', async () => {
  const res = await agent
    .patch('/api/editor/item/display-name')
    .send({ mode: 'woerter', id: 'loeschen', newDisplayName: 'löschen' });
  expect(res.status).toBe(409);
  expect(res.body.ok).toBe(false);
});

test('PATCH display-name succeeds and does not rename files when assets exist', async () => {
  // Create dummy files for image and sound
  const imgPath = path.join(dataDir, 'wörter', 'images', 'l', 'Löschen.jpg');
  const sndPath = path.join(dataDir, 'wörter', 'sounds', 'l', 'Löschen.mp3');
  await fsp.mkdir(path.dirname(imgPath), { recursive: true });
  await fsp.mkdir(path.dirname(sndPath), { recursive: true });
  await fsp.writeFile(imgPath, 'x');
  await fsp.writeFile(sndPath, 'x');

  const res = await agent
    .patch('/api/editor/item/display-name')
    .send({ mode: 'woerter', id: 'loeschen', newDisplayName: 'löschen' });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);

  // DB should reflect new name; paths remain unchanged (no auto-rename)
  const db = JSON.parse(await fsp.readFile(path.join(dataDir, 'items_database.json'), 'utf8'));
  expect(db.loeschen.name).toBe('löschen');
  // Files should still exist at their original locations
  await expect(fsp.access(imgPath)).resolves.not.toThrow();
  await expect(fsp.access(sndPath)).resolves.not.toThrow();
});
