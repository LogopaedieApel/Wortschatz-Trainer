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
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wst-telemetry-'));
  dataDir = path.join(tmpDir, 'data');
  stateDir = path.join(tmpDir, 'state');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  // minimal DB/manifest files for potential indirect reads
  await fsp.writeFile(path.join(dataDir, 'items_database.json'), JSON.stringify({}), 'utf8');
  await fsp.writeFile(path.join(dataDir, 'items_database_saetze.json'), JSON.stringify({}), 'utf8');
  await fsp.writeFile(path.join(dataDir, 'sets.json'), JSON.stringify({}), 'utf8');
  await fsp.writeFile(path.join(dataDir, 'sets_saetze.json'), JSON.stringify({}), 'utf8');

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

describe('Telemetry API', () => {
  test('session lifecycle, quiz events (single+batch), progress filtering', async () => {
    // create patient and assignment
    let res = await agent.post('/api/patients').send({ name: 'Tele P' });
    expect(res.status).toBe(200);
    const pid = res.body.item.id;

    res = await agent.post('/api/assignments').send({ patientId: pid, mode: 'quiz', material: 'woerter', sets: ['sets/foo.json'] });
    expect(res.status).toBe(200);
    const aid = res.body.item.id;

    // start session with pid/aid
    res = await agent.post('/api/telemetry/session/start').send({ patientId: pid, assignmentId: aid, mode: 'quiz', material: 'woerter', sets: ['sets/foo.json'] });
    expect(res.status).toBe(200);
    const sid = res.body.sessionId;
    expect(typeof sid).toBe('string');

    // send one single quiz event
    res = await agent.post('/api/telemetry/quiz').send({ sessionId: sid, itemId: 'item_1', correct: true, timeMs: 123 });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);

    // send batch of events
    res = await agent.post('/api/telemetry/quiz').send({ events: [
      { sessionId: sid, itemId: 'item_2', correct: false },
      { sessionId: sid, itemId: 'item_3', correct: true, timeMs: 77 }
    ]});
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);

    // unknown session should 404
    res = await agent.post('/api/telemetry/quiz').send({ sessionId: 'sid_unknown', itemId: 'x', correct: true });
    expect(res.status).toBe(404);

    // malformed body should 400
    res = await agent.post('/api/telemetry/quiz').send({});
    expect(res.status).toBe(400);

    // end session
    res = await agent.post('/api/telemetry/session/end').send({ sessionId: sid });
    expect(res.status).toBe(200);
    expect(res.body.item).toHaveProperty('endedAt');
    expect(typeof res.body.item.durationMs === 'number' || typeof res.body.item.durationMs === 'undefined').toBe(true);

    // progress filter by patient
    res = await agent.get(`/api/progress?patientId=${pid}`);
    expect(res.status).toBe(200);
    const items = res.body.items;
    expect(Array.isArray(items)).toBe(true);
    const sess = items.find(x => x.id === sid);
    expect(sess).toBeTruthy();
    // summary aggregated: total 3 events, 2 correct, 1 incorrect
    expect(sess.summary).toBeTruthy();
    expect(sess.summary.total).toBe(3);
    expect(sess.summary.correct).toBe(2);
    expect(sess.summary.incorrect).toBe(1);

    // also filter by assignmentId
    res = await agent.get(`/api/progress?patientId=${pid}&assignmentId=${aid}`);
    expect(res.status).toBe(200);
    expect(res.body.items.find(x => x.id === sid)).toBeTruthy();

    // create another session to test limit and sorting
    res = await agent.post('/api/telemetry/session/start').send({ patientId: pid, assignmentId: aid, mode: 'quiz', material: 'woerter', sets: ['sets/foo.json'] });
    expect(res.status).toBe(200);
    const sid2 = res.body.sessionId;
    // no events for sid2; end immediately
    await agent.post('/api/telemetry/session/end').send({ sessionId: sid2 });

    res = await agent.get(`/api/progress?patientId=${pid}&limit=1`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
  });

  test('start guards: invalid mode/material/sets', async () => {
    // invalid mode
    let res = await agent.post('/api/telemetry/session/start').send({ mode: 'x', material: 'woerter', sets: ['a'] });
    expect(res.status).toBe(400);
    // invalid material
    res = await agent.post('/api/telemetry/session/start').send({ mode: 'quiz', material: 'x', sets: ['a'] });
    expect(res.status).toBe(400);
    // invalid sets (empty)
    res = await agent.post('/api/telemetry/session/start').send({ mode: 'quiz', material: 'woerter', sets: [] });
    expect(res.status).toBe(400);
  });
});
