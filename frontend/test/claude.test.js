import { test, expect } from '@jest/globals';
import { buildRequest, createClaude, SYSTEM_PROMPT } from '../src/claude.js';

const config = { claudeModel: 'm', claudeMaxTokens: 99, claudeEffort: 'low' };
const groups = [
  { parentId: 'a', answer: 'AA', score: 0.9 },
  { parentId: 'b', answer: 'BB', score: 0.8 },
];

test('request shape: search_result blocks then question text', () => {
  const r = buildRequest(config, 'Q?', groups);
  expect(r.model).toBe('m');
  expect(r.max_tokens).toBe(99);
  expect(r.system).toBe(SYSTEM_PROMPT);
  const content = r.messages[0].content;
  expect(content.map((b) => b.type)).toStrictEqual(['search_result', 'search_result', 'text']);
  expect(content[0].content).toStrictEqual([{ type: 'text', text: 'AA' }]);
  expect(content[0].source).toBe('a');
  expect(content[2].text).toBe('Q?');
  expect(r.output_config).toStrictEqual({ effort: 'low' });
});

test('no effort when env is empty', () => {
  expect('output_config' in buildRequest({ ...config, claudeEffort: '' }, 'Q?', groups)).toBe(false);
});

test('text blocks of the response are concatenated', async () => {
  const client = { messages: { create: async () => ({ content: [{ type: 'text', text: 'Hel' }, { type: 'thinking' }, { type: 'text', text: 'lo' }] }) } };
  expect(await createClaude(config, client)('Q?', groups)).toBe('Hello');
});

test('system prompt refuses off-topic requests even when results are only related', () => {
  expect(SYSTEM_PROMPT).toMatch(/directly answers the question/);
  expect(SYSTEM_PROMPT).toMatch(/jokes/);
  expect(SYSTEM_PROMPT).toMatch(/passwords or credentials/);
});
