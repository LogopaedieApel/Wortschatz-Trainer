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
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wst-ro-'));
  dataDir = path.join(tmpDir, 'data');
  stateDir = path.join(tmpDir, 'state');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  // Set environment for this suite BEFORE requiring server
  process.env.DATA_DIR = dataDir;
  process.env.STATE_DIR = stateDir;
  process.env.DISABLE_BACKUPS = '1';
  process.env.EDITOR_READONLY = '1';

  app = require('../server');
  server = app.listen(0);
  agent = request.agent(server);
});

afterAll(async () => {
  if (server && server.close) await new Promise(res => server.close(res));
});

// Read-only must block save-all-data
it('blocks save-all-data in read-only mode', async () => {
  const manifest = {};
  const body = { database: {}, manifest, mode: 'woerter' };
  const res = await agent.post('/api/save-all-data').send(body);
  expect(res.status).toBe(423);
});

// Read-only must block delete-item
it('blocks delete-item in read-only mode', async () => {
  const res = await agent.post('/api/delete-item').send({ id: 'irgendwas', mode: 'woerter' });
  expect(res.status).toBe(423);
});

// Read-only must block telemetry writes
it('blocks telemetry routes in read-only mode', async () => {
  let res = await agent.post('/api/telemetry/session/start').send({ mode: 'quiz', material: 'woerter', sets: ['a'] });
  expect(res.status).toBe(423);
  res = await agent.post('/api/telemetry/session/end').send({ sessionId: 'sid_foo' });
  expect(res.status).toBe(423);
  res = await agent.post('/api/telemetry/quiz').send({ sessionId: 'sid_foo', itemId: 'x', correct: true });
  expect(res.status).toBe(423);
});
