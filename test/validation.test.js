// Unit tests for task validation (no database needed).
// Run with:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTask } from '../src/validation.js';

test('accepts a minimal task and fills in defaults', () => {
  const { errors, data } = validateTask({ title: '  Buy milk  ' });
  assert.deepEqual(errors, []);
  assert.deepEqual(data, { title: 'Buy milk', description: null, status: 'todo', due_date: null });
});

test('accepts a full task', () => {
  const { errors, data } = validateTask({
    title: 'Deploy API',
    description: 'Use PM2',
    status: 'in_progress',
    due_date: '2026-12-01',
  });
  assert.deepEqual(errors, []);
  assert.equal(data.status, 'in_progress');
  assert.equal(data.due_date, '2026-12-01');
});

test('requires a title', () => {
  assert.deepEqual(validateTask({}).errors, ['Title is required.']);
  assert.deepEqual(validateTask({ title: '   ' }).errors, ['Title is required.']);
  assert.deepEqual(validateTask(null).errors, ['Title is required.']);
});

test('rejects a title longer than 255 characters', () => {
  const { errors } = validateTask({ title: 'x'.repeat(256) });
  assert.equal(errors.length, 1);
});

test('rejects an unknown status', () => {
  const { errors } = validateTask({ title: 'A', status: 'finished' });
  assert.match(errors[0], /Status must be one of/);
});

test('rejects badly formatted or impossible due dates', () => {
  for (const due_date of ['01/12/2026', '2026-13-01', '2026-02-31', 20261201]) {
    const { errors } = validateTask({ title: 'A', due_date });
    assert.equal(errors.length, 1, `expected ${due_date} to be rejected`);
  }
});

test('treats an empty due date as "no due date"', () => {
  const { errors, data } = validateTask({ title: 'A', due_date: '' });
  assert.deepEqual(errors, []);
  assert.equal(data.due_date, null);
});
