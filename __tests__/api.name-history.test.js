const request = require('supertest');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

let app;
let server;
let agent;
let tmpDir;
let dataDir;
let stateDir;

beforeAll(async () => {
  tmpDir = await fsp.mkdtemp(path.join(require('os').tmpdir(), 'wst-'));
  dataDir = path.join(tmpDir, 'data');
  stateDir = path.join(tmpDir, 'state');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  // Seed minimal database
  const db = { becher: { name: 'Becher', image: '', sound: '', folder: 'b' } };
  await fsp.writeFile(path.join(dataDir, 'items_database.json'), JSON.stringify(db, null, 2));
  await fsp.writeFile(path.join(dataDir, 'sets.json'), JSON.stringify({}, null, 2));

  process.env.DATA_DIR = dataDir;
  process.env.STATE_DIR = stateDir;
  process.env.EDITOR_READONLY = '';
  process.env.DISABLE_BACKUPS = '1';

  app = require('../server'); // exports app when not run as main (serverInstance||app)
  server = app.listen(0);
  agent = request.agent(server);
});

afterAll(async () => {
  if (server && server.close) await new Promise(res => server.close(res));
});

describe('Name History API', () => {
  const mode = 'woerter';
  const id = 'becher';

  test('GET history returns ok', async () => {
    const res = await agent.get('/api/editor/name-history').query({ mode, id });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    expect(res.body).toHaveProperty('entries');
    expect(res.body).toHaveProperty('cursor');
  });

  test('PATCH display-name writes and updates history', async () => {
    const newName = 'Becher Test';
    const res = await agent.patch('/api/editor/item/display-name').send({ mode, id, newDisplayName: newName });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    const hist = await agent.get('/api/editor/name-history').query({ mode, id });
    expect(hist.status).toBe(200);
    expect(hist.body.ok).toBe(true);
    expect(Array.isArray(hist.body.entries)).toBe(true);
    expect(hist.body.cursor).toBeGreaterThanOrEqual(0);
  });

  test('Undo/Redo boundaries', async () => {
    // Try undo until 409
    let undoRes = await agent.post('/api/editor/name-undo').send({ mode, id });
    while (undoRes.status === 200) {
      undoRes = await agent.post('/api/editor/name-undo').send({ mode, id });
    }
    expect(undoRes.status).toBe(409);
    // Redo until 409
    let redoRes = await agent.post('/api/editor/name-redo').send({ mode, id });
    while (redoRes.status === 200) {
      redoRes = await agent.post('/api/editor/name-redo').send({ mode, id });
    }
    expect(redoRes.status).toBe(409);
  });

  test('Read-only mode blocks writes', async () => {
    process.env.EDITOR_READONLY = '1';
    const res = await agent.patch('/api/editor/item/display-name').send({ mode, id, newDisplayName: 'ReadOnly Test' });
    expect(res.status).toBe(423);
    process.env.EDITOR_READONLY = '';
  });
});
