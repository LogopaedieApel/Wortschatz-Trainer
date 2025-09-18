const request = require('supertest');
const fsp = require('fs').promises;
const fs = require('fs');
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
async function readJson(p) {
  return JSON.parse(await fsp.readFile(p, 'utf8'));
}

beforeAll(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wst-setops-'));
  dataDir = path.join(tmpDir, 'data');
  stateDir = path.join(tmpDir, 'state');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  // Seed DB + sets manifest + a set file
  await writeJson(path.join(dataDir, 'items_database.json'), { alpha: { name: 'Alpha', image: '', sound: '', folder: 'a' } });
  await writeJson(path.join(dataDir, 'sets.json'), {
    bereich: {
      displayName: 'Bereich',
      gruppe: {
        displayName: 'Gruppe',
        alt: { displayName: 'alt', path: 'data/sets/bereich_gruppe_alt.json' }
      }
    }
  });
  await writeJson(path.join(dataDir, 'sets', 'bereich_gruppe_alt.json'), ['alpha']);

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

function archiveGlob(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

/**
 * Test 1: Umbenennen (Pfadänderung) verschiebt die Datei
 */
test('Leaf-Umbenennung verschiebt Set-Datei', async () => {
  const newManifest = {
    bereich: {
      displayName: 'Bereich',
      gruppe: {
        displayName: 'Gruppe',
        alt: { displayName: 'neu', path: 'data/sets/bereich_gruppe_neu.json', items: ['alpha'] }
      }
    }
  };
  const res = await agent.post('/api/save-all-data').send({ database: { alpha: { name: 'Alpha', image: '', sound: '', folder: 'a' } }, manifest: newManifest, mode: 'woerter' });
  expect(res.status).toBe(200);

  // Neue Datei vorhanden
  const newPath = path.join(dataDir, 'sets', 'bereich_gruppe_neu.json');
  const statNew = await fsp.stat(newPath);
  expect(statNew.isFile()).toBe(true);
  const arr = await readJson(newPath);
  expect(arr).toContain('alpha');

  // Manifest gespeichert mit neuem Pfad
  const savedManifest = await readJson(path.join(dataDir, 'sets.json'));
  expect(savedManifest.bereich.gruppe.alt.path).toBe('data/sets/bereich_gruppe_neu.json');
});

/**
 * Test 2: Löschen archiviert die Datei
 */
test('Leaf-Löschung archiviert Set-Datei', async () => {
  // Setup: schreibe eine Set-Datei und manifest mit einem leaf
  await writeJson(path.join(dataDir, 'sets.json'), {
    x: { displayName: 'X', y: { displayName: 'Y', z: { displayName: 'z', path: 'data/sets/x_y_z.json' } } }
  });
  await writeJson(path.join(dataDir, 'sets', 'x_y_z.json'), ['alpha']);

  const newManifest = {
    x: { displayName: 'X', y: { displayName: 'Y' } } // z entfernt
  };
  const res = await agent.post('/api/save-all-data').send({ database: { alpha: { name: 'Alpha', image: '', sound: '', folder: 'a' } }, manifest: newManifest, mode: 'woerter' });
  expect(res.status).toBe(200);

  // Datei soll nicht mehr am alten Ort liegen
  const oldPath = path.join(dataDir, 'sets', 'x_y_z.json');
  let oldExists = true;
  try { await fsp.stat(oldPath); } catch { oldExists = false; }
  expect(oldExists).toBe(false);

  // Es sollte im Archiv ein Ordner mit Datum/Timestamp existieren, Datei dort vorhanden
  const archiveBase = path.join(stateDir, '_deleted_files');
  const days = archiveGlob(archiveBase);
  expect(days.length).toBeGreaterThan(0);
  const dayDir = path.join(archiveBase, days[0]);
  const files = archiveGlob(dayDir);
  expect(files.some(f => f.toLowerCase() === 'x_y_z.json')).toBe(true);
});
