import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEXTS, text, resolveLang } from '../src/messages.js';

test('all 12 texts are non-empty', () => {
  const keys = Object.keys(TEXTS);
  assert.equal(keys.length, 4);
  for (const key of keys) {
    for (const lang of ['uk', 'en', 'pl']) assert.ok(TEXTS[key][lang].length > 0, `${key}.${lang}`);
  }
});

test('unknown or missing lang falls back to English', () => {
  assert.equal(resolveLang('de'), 'en');
  assert.equal(resolveLang(undefined), 'en');
  assert.equal(text('noData', 'de'), TEXTS.noData.en);
  assert.equal(text('rateLimited', undefined), 'Too many requests. Please try again later.');
});
