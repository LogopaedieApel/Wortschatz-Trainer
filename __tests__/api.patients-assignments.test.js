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

beforeAll(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wst-therapist-'));
  dataDir = path.join(tmpDir, 'data');
  stateDir = path.join(tmpDir, 'state');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  // minimal DB files for /api/get-all-data if touched indirectly
  await fsp.writeFile(path.join(dataDir, 'items_database.json'), JSON.stringify({}), 'utf8');
  await fsp.writeFile(path.join(dataDir, 'items_database_saetze.json'), JSON.stringify({}), 'utf8');
  await fsp.writeFile(path.join(dataDir, 'sets.json'), JSON.stringify({}), 'utf8');

  process.env.DATA_DIR = dataDir;
  process.env.STATE_DIR = stateDir;
  process.env.DISABLE_BACKUPS = '1';
  delete process.env.EDITOR_READONLY;

  app = require('../server');
  server = app.listen(0);
  agent = request.agent(server);
});

afterAll(async () => {
  if (server && server.close) await new Promise(res => server.close(res));
});

describe('Patients API', () => {
  test('create, prevent duplicate (case-insensitive), update, soft-delete', async () => {
    // create
    let res = await agent.post('/api/patients').send({ name: 'TestA' });
    expect(res.status).toBe(200);
    const p1 = res.body.item;
    expect(p1).toHaveProperty('id');
    // duplicate (different case)
    res = await agent.post('/api/patients').send({ name: 'testa' });
    expect(res.status).toBe(409);
    // update name to new unique
    res = await agent.patch(`/api/patients/${p1.id}`).send({ name: 'TestB' });
    expect(res.status).toBe(200);
    expect(res.body.item.name).toBe('TestB');
    // soft delete
    res = await agent.delete(`/api/patients/${p1.id}`);
    expect(res.status).toBe(200);
    expect(res.body.item.active).toBe(false);
    // list without inactive should be empty
    res = await agent.get('/api/patients');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.find(x => x.id === p1.id)).toBeUndefined();
    // list with inactive includes it
    res = await agent.get('/api/patients?includeInactive=1');
    expect(res.status).toBe(200);
    expect(res.body.items.find(x => x.id === p1.id)).toBeTruthy();
  });
});

describe('Assignments API', () => {
  test('create and filter by patientId; update fields', async () => {
    // create patient
    let res = await agent.post('/api/patients').send({ name: 'P1' });
    expect(res.status).toBe(200);
    const pid = res.body.item.id;
    // create assignment
    res = await agent.post('/api/assignments').send({ patientId: pid, mode: 'quiz', material: 'woerter', sets: ['sets/foo.json'] });
    expect(res.status).toBe(200);
    const asg = res.body.item;
    expect(asg.patientId).toBe(pid);
    // filter
    res = await agent.get(`/api/assignments?patientId=${pid}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    // update mode/material/sets
    res = await agent.patch(`/api/assignments/${asg.id}`).send({ mode: 'manual', material: 'saetze', sets: ['sets_saetze/bar.json'] });
    expect(res.status).toBe(200);
    expect(res.body.item.mode).toBe('manual');
    expect(res.body.item.material).toBe('saetze');
    expect(Array.isArray(res.body.item.sets)).toBe(true);
  });

  test('reject invalid values', async () => {
    let res = await agent.post('/api/patients').send({ name: 'P2' });
    expect(res.status).toBe(200);
    const pid = res.body.item.id;
    // invalid mode
    res = await agent.post('/api/assignments').send({ patientId: pid, mode: 'x', material: 'woerter', sets: ['a'] });
    expect(res.status).toBe(400);
    // invalid material
    res = await agent.post('/api/assignments').send({ patientId: pid, mode: 'quiz', material: 'x', sets: ['a'] });
    expect(res.status).toBe(400);
    // invalid sets
    res = await agent.post('/api/assignments').send({ patientId: pid, mode: 'quiz', material: 'woerter', sets: [] });
    expect(res.status).toBe(400);
  });
});
