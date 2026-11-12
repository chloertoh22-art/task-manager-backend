// API tests for requests that are rejected before the database is used,
// so they run without MySQL.  Run with:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';

test('GET / describes the API', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Task Manager API');
});

test('POST /api/tasks without a title returns 400 with details', async () => {
  const res = await request(app).post('/api/tasks').send({ description: 'no title' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body.details, ['Title is required.']);
});

test('POST /api/tasks with invalid JSON returns 400', async () => {
  const res = await request(app)
    .post('/api/tasks')
    .set('Content-Type', 'application/json')
    .send('{"title": ');
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Request body is not valid JSON.');
});

test('GET /api/tasks with an unknown status filter returns 400', async () => {
  const res = await request(app).get('/api/tasks?status=finished');
  assert.equal(res.status, 400);
});

test('GET /api/tasks/abc returns 400', async () => {
  const res = await request(app).get('/api/tasks/abc');
  assert.equal(res.status, 400);
});

test('unknown routes return 404', async () => {
  const res = await request(app).get('/api/nope');
  assert.equal(res.status, 404);
});

test('GET / reports a version number', async () => {
  const res = await request(app).get('/');
  assert.equal(typeof res.body.version, 'number');
});
