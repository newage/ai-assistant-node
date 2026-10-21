import { test, expect } from '@jest/globals';
import { TEXTS, text, resolveLang } from '../src/messages.js';

test('all 12 texts are non-empty', () => {
  const keys = Object.keys(TEXTS);
  expect(keys.length).toBe(4);
  for (const key of keys) {
    for (const lang of ['uk', 'en', 'pl']) expect(TEXTS[key][lang].length > 0).toBeTruthy();
  }
});

test('unknown or missing lang falls back to English', () => {
  expect(resolveLang('de')).toBe('en');
  expect(resolveLang(undefined)).toBe('en');
  expect(text('noData', 'de')).toBe(TEXTS.noData.en);
  expect(text('rateLimited', undefined)).toBe('Too many requests. Please try again later.');
});
