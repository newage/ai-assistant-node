import { test, expect } from '@jest/globals';
import { createRateLimiter } from '../src/rate-limit.js';

const headers = { 'x-forwarded-for': '1.2.3.4' };

test('rateLimited true -> limited', async () => {
  const limited = createRateLimiter({ enabled: true, check: async () => ({ rateLimited: true }) });
  expect(await limited(headers)).toBe(true);
});

test('rateLimited false -> passes', async () => {
  const limited = createRateLimiter({ enabled: true, check: async () => ({ rateLimited: false }) });
  expect(await limited(headers)).toBe(false);
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
  expect(await limited(headers)).toBe(false);
  expect(logs[0][0]).toBe('rate-limit-error');
});

test('disabled (local) never calls the checker', async () => {
  let called = false;
  const limited = createRateLimiter({ enabled: false, check: async () => ((called = true), { rateLimited: true }) });
  expect(await limited(headers)).toBe(false);
  expect(called).toBe(false);
});
