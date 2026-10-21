import { test, expect } from '@jest/globals';
import { loadConfig } from '../src/config.js';

test('defaults apply to empty env', () => {
  const c = loadConfig({});
  expect(c.vectorTopK).toBe(10);
  expect(c.vectorMinScore).toBe(0.84);
  expect(c.maxMessages).toBe(4);
  expect(c.maxMessageChars).toBe(200);
  expect(c.claudeMaxTokens).toBe(1024);
});

test('numbers are parsed and empty values fall back', () => {
  const c = loadConfig({ VECTOR_TOP_K: '5', MAX_MESSAGES: '', VECTOR_MIN_SCORE: 'abc' });
  expect(c.vectorTopK).toBe(5);
  expect(c.maxMessages).toBe(4);
  expect(c.vectorMinScore).toBe(0.84);
});

test('empty CLAUDE_EFFORT stays empty', () => {
  expect(loadConfig({ CLAUDE_EFFORT: '' }).claudeEffort).toBe('');
  expect(loadConfig({ CLAUDE_EFFORT: 'low' }).claudeEffort).toBe('low');
});

test('rerank is off by default and parsed from env', () => {
  const d = loadConfig({});
  expect(d.rerankModel).toBe('');
  expect(d.rerankMinScore).toBe(0.5);
  const c = loadConfig({ RERANK_MODEL: 'bge-reranker-v2-m3', RERANK_MIN_SCORE: '0.3' });
  expect(c.rerankModel).toBe('bge-reranker-v2-m3');
  expect(c.rerankMinScore).toBe(0.3);
  expect(loadConfig({ RERANK_MODEL: '', RERANK_MIN_SCORE: '' }).rerankMinScore).toBe(0.5);
});
