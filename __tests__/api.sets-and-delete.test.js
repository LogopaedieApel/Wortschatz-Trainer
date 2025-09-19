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
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wst-sets-'));
  dataDir = path.join(tmpDir, 'data');
  stateDir = path.join(tmpDir, 'state');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  // Seed DB + sets manifest minimal
  await writeJson(path.join(dataDir, 'items_database.json'), { lamm: { name: 'Lamm', image: '', sound: '', folder: 'l' } });
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
 * Test: Neue Spalte anlegen (Artikulation/L final) und Set-Datei schreiben
 */
test('Neue Spalte anlegen und speichern', async () => {
  const manifest = {
    artikulation: {
      displayName: 'Artikulation',
      l: {
        displayName: 'L',
        final: {
          displayName: 'final',
          path: 'data/sets/artikulation_l_final.json',
          items: ['lamm']
        }
      }
    }
  };
  const body = { database: { lamm: { name: 'Lamm', image: '', sound: '', folder: 'l' } }, manifest, mode: 'woerter' };
  const res = await agent.post('/api/save-all-data').send(body);
  expect(res.status).toBe(200);

  // get-all-data sollte Set laden
  const all = await agent.get('/api/get-all-data').query({ mode: 'woerter' });
  expect(all.status).toBe(200);
  const flatSets = all.body.flatSets || {};
  expect(flatSets['data/sets/artikulation_l_final.json']).toBeTruthy();
  expect(flatSets['data/sets/artikulation_l_final.json'].items).toContain('lamm');

  // Prüfe, dass die Set-Datei physisch existiert
  const setPath = path.join(dataDir, 'sets', 'artikulation_l_final.json');
  const stat = await fsp.stat(setPath);
  expect(stat.isFile()).toBe(true);
});

/**
 * Test: Manuelles Löschen entfernt DB-Eintrag und Set-Referenzen (wenn Set existiert)
 */
test('Löschen entfernt ID aus Set-Dateien', async () => {
  // Vorbereiten: Set mit ID 'lamm' schreiben
  await writeJson(path.join(dataDir, 'sets', 'testliste.json'), ['lamm']);
  // Manifest generieren lassen
  await agent.post('/api/sync-files').query({ mode: 'woerter' });

  // Löschen
  const del = await agent.post('/api/delete-item').send({ id: 'lamm', mode: 'woerter' });
  expect([200, 500]).toContain(del.status);

  // Set-Datei sollte 'lamm' nicht mehr enthalten (falls vorhanden)
  try {
    const arr = JSON.parse(await fsp.readFile(path.join(dataDir, 'sets', 'testliste.json'), 'utf8'));
    expect(arr.includes('lamm')).toBe(false);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e; // falls Set nicht existiert, ist es okay
  }
});
