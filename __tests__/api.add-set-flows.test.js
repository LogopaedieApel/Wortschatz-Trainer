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
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wst-addsets-'));
  dataDir = path.join(tmpDir, 'data');
  stateDir = path.join(tmpDir, 'state');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  // Seed DBs + manifests
  await writeJson(path.join(dataDir, 'items_database.json'), {
    lamm: { name: 'Lamm', image: '', sound: '', folder: 'l' }
  });
  await writeJson(path.join(dataDir, 'items_database_saetze.json'), {
    satz1: { name: 'Reim 1', image: '', sound: '', folder: '' }
  });
  await writeJson(path.join(dataDir, 'sets.json'), {});
  await writeJson(path.join(dataDir, 'sets_saetze.json'), {});

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

test('Depth 1: Bereich Wortschatz -> Tiere', async () => {
  const manifest = {
    wortschatz: {
      displayName: 'Wortschatz',
      Tiere: { displayName: 'Tiere', path: 'data/sets/wortschatz_tiere.json', items: ['lamm'] }
    }
  };
  const body = { database: { lamm: { name: 'Lamm', image: '', sound: '', folder: 'l' } }, manifest, mode: 'woerter' };
  const res = await agent.post('/api/save-all-data').send(body);
  expect(res.status).toBe(200);

  const all = await agent.get('/api/get-all-data').query({ mode: 'woerter' });
  expect(all.status).toBe(200);
  const flat = all.body.flatSets || {};
  expect(flat['data/sets/wortschatz_tiere.json']).toBeTruthy();
  expect(flat['data/sets/wortschatz_tiere.json'].items).toContain('lamm');
  const setPath = path.join(dataDir, 'sets', 'wortschatz_tiere.json');
  await expect(fsp.access(setPath)).resolves.not.toThrow();
});

test('Depth 2: Bereich Artikulation -> L -> final', async () => {
  const manifest = {
    artikulation: {
      displayName: 'Artikulation',
      l: {
        displayName: 'L',
        final: { displayName: 'final', path: 'data/sets/artikulation_l_final.json', items: ['lamm'] }
      }
    }
  };
  const body = { database: { lamm: { name: 'Lamm', image: '', sound: '', folder: 'l' } }, manifest, mode: 'woerter' };
  const res = await agent.post('/api/save-all-data').send(body);
  expect(res.status).toBe(200);

  const all = await agent.get('/api/get-all-data').query({ mode: 'woerter' });
  const flat = all.body.flatSets || {};
  expect(flat['data/sets/artikulation_l_final.json']).toBeTruthy();
  expect(flat['data/sets/artikulation_l_final.json'].items).toContain('lamm');
  const setPath = path.join(dataDir, 'sets', 'artikulation_l_final.json');
  await expect(fsp.access(setPath)).resolves.not.toThrow();
});

test('Neuer Bereich: Grammatik (Tiefe 1) -> Plural', async () => {
  const manifest = {
    Grammatik: {
      displayName: 'Grammatik',
      Plural: { displayName: 'Plural', path: 'data/sets/grammatik_plural.json', items: ['lamm'] }
    }
  };
  const body = { database: { lamm: { name: 'Lamm', image: '', sound: '', folder: 'l' } }, manifest, mode: 'woerter' };
  const res = await agent.post('/api/save-all-data').send(body);
  expect(res.status).toBe(200);
  const all = await agent.get('/api/get-all-data').query({ mode: 'woerter' });
  const flat = all.body.flatSets || {};
  expect(flat['data/sets/grammatik_plural.json']).toBeTruthy();
  const setPath = path.join(dataDir, 'sets', 'grammatik_plural.json');
  await expect(fsp.access(setPath)).resolves.not.toThrow();
});

test('Sätze-Modus: Bereich Reime -> Paarreime', async () => {
  const manifest = {
    Reime: {
      displayName: 'Reime',
      Paarreime: { displayName: 'Paarreime', path: 'data/sets_saetze/reime_paarreime.json', items: ['satz1'] }
    }
  };
  const body = { database: { satz1: { name: 'Reim 1', image: '', sound: '', folder: '' } }, manifest, mode: 'saetze' };
  const res = await agent.post('/api/save-all-data').send(body);
  expect(res.status).toBe(200);

  const all = await agent.get('/api/get-all-data').query({ mode: 'saetze' });
  expect(all.status).toBe(200);
  const flat = all.body.flatSets || {};
  expect(flat['data/sets_saetze/reime_paarreime.json']).toBeTruthy();
  expect(flat['data/sets_saetze/reime_paarreime.json'].items).toContain('satz1');
  const setPath = path.join(dataDir, 'sets_saetze', 'reime_paarreime.json');
  await expect(fsp.access(setPath)).resolves.not.toThrow();
});
