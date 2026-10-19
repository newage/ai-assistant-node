import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createLog } from '../src/log.js';

test('writes JSON outside production', () => {
  const spy = mock.method(console, 'log', () => {});
  createLog('local')('received', { a: 1 });
  assert.equal(spy.mock.callCount(), 1);
  assert.deepEqual(JSON.parse(spy.mock.calls[0].arguments[0]), { stage: 'received', a: 1 });
  spy.mock.restore();
});

test('writes nothing in production', () => {
  const spy = mock.method(console, 'log', () => {});
  createLog('production')('received');
  assert.equal(spy.mock.callCount(), 0);
  spy.mock.restore();
});
