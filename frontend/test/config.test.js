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

test('rerank is off by default and parsed from env', () => {
  const d = loadConfig({});
  assert.equal(d.rerankModel, '');
  assert.equal(d.rerankMinScore, 0.5);
  const c = loadConfig({ RERANK_MODEL: 'bge-reranker-v2-m3', RERANK_MIN_SCORE: '0.3' });
  assert.equal(c.rerankModel, 'bge-reranker-v2-m3');
  assert.equal(c.rerankMinScore, 0.3);
  assert.equal(loadConfig({ RERANK_MODEL: '', RERANK_MIN_SCORE: '' }).rerankMinScore, 0.5);
});
