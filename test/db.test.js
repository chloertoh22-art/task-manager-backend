// Tests for the plain-language database error hints (no database needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainDbError } from '../src/db.js';

test('explains common database errors', () => {
  assert.match(explainDbError({ code: 'ETIMEDOUT' }), /security group/);
  assert.match(explainDbError({ code: 'ER_ACCESS_DENIED_ERROR' }), /DB_PASSWORD/);
  assert.match(explainDbError({ code: 'ER_BAD_DB_ERROR' }), /db:init/);
  assert.match(explainDbError({ code: 'HANDSHAKE_SSL_ERROR' }), /DB_SSL/);
});

test('falls back to a general hint for unknown errors', () => {
  assert.match(explainDbError({ code: 'SOMETHING_ELSE' }), /\.env/);
});

test('explains the secure-transport error from RDS', () => {
  assert.match(explainDbError({ code: 'ER_SECURE_TRANSPORT_REQUIRED' }), /DB_SSL=true/);
});
