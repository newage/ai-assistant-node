import { jest, test, expect } from '@jest/globals';
import { createLog } from '../src/log.js';

test('writes JSON outside production', () => {
  const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
  createLog('local')('received', { a: 1 });
  expect(spy.mock.calls.length).toBe(1);
  expect(JSON.parse(spy.mock.calls[0][0])).toStrictEqual({ stage: 'received', a: 1 });
  spy.mockRestore();
});

test('writes nothing in production', () => {
  const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
  createLog('production')('received');
  expect(spy.mock.calls.length).toBe(0);
  spy.mockRestore();
});
