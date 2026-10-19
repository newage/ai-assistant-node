import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('defaults apply to empty env', () => {
  const c = loadConfig({});
  assert.equal(c.vectorTopK, 10);
  assert.equal(c.vectorMinScore, 0.84);
  assert.equal(c.maxMessages, 4);
  assert.equal(c.maxMessageChars, 200);
  assert.equal(c.claudeMaxTokens, 1024);
});

test('numbers are parsed and empty values fall back', () => {
  const c = loadConfig({ VECTOR_TOP_K: '5', MAX_MESSAGES: '', VECTOR_MIN_SCORE: 'abc' });
  assert.equal(c.vectorTopK, 5);
  assert.equal(c.maxMessages, 4);
  assert.equal(c.vectorMinScore, 0.84);
});

test('empty CLAUDE_EFFORT stays empty', () => {
  assert.equal(loadConfig({ CLAUDE_EFFORT: '' }).claudeEffort, '');
  assert.equal(loadConfig({ CLAUDE_EFFORT: 'low' }).claudeEffort, 'low');
});
