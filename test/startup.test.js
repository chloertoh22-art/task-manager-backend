// Tests for the startup helpers (no database needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeConfig, retryDelayMs } from '../src/startup.js';

test('retries after 5, 10, 20 and then every 30 seconds', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(retryDelayMs), [5000, 10000, 20000, 30000, 30000, 30000]);
});

test('config summary never contains the password', () => {
  const line = describeConfig({ DB_HOST: 'db.example', DB_PASSWORD: 'SuperSecret123', DB_SSL: 'true' });
  assert.doesNotMatch(line, /SuperSecret123/);
  assert.match(line, /DB_PASSWORD=\(set\)/);
  assert.match(line, /DB_HOST=db\.example/);
});

test('config summary warns when the password is missing', () => {
  assert.match(describeConfig({}), /DB_PASSWORD=\(NOT SET\)/);
});
