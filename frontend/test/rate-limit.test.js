import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/rate-limit.js';

const headers = { 'x-forwarded-for': '1.2.3.4' };

test('rateLimited true -> limited', async () => {
  const limited = createRateLimiter({ enabled: true, check: async () => ({ rateLimited: true }) });
  assert.equal(await limited(headers), true);
});

test('rateLimited false -> passes', async () => {
  const limited = createRateLimiter({ enabled: true, check: async () => ({ rateLimited: false }) });
  assert.equal(await limited(headers), false);
});

test('check failure is logged and request passes', async () => {
  const logs = [];
  const limited = createRateLimiter({
    enabled: true,
    check: async () => {
      throw new Error('boom');
    },
    log: (stage, data) => logs.push([stage, data]),
  });
  assert.equal(await limited(headers), false);
  assert.equal(logs[0][0], 'rate-limit-error');
});

test('disabled (local) never calls the checker', async () => {
  let called = false;
  const limited = createRateLimiter({ enabled: false, check: async () => ((called = true), { rateLimited: true }) });
  assert.equal(await limited(headers), false);
  assert.equal(called, false);
});
