import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, createClaude, SYSTEM_PROMPT } from '../src/claude.js';

const config = { claudeModel: 'm', claudeMaxTokens: 99, claudeEffort: 'low' };
const groups = [
  { parentId: 'a', answer: 'AA', score: 0.9 },
  { parentId: 'b', answer: 'BB', score: 0.8 },
];

test('request shape: search_result blocks then question text', () => {
  const r = buildRequest(config, 'Q?', groups);
  assert.equal(r.model, 'm');
  assert.equal(r.max_tokens, 99);
  assert.equal(r.system, SYSTEM_PROMPT);
  const content = r.messages[0].content;
  assert.deepEqual(content.map((b) => b.type), ['search_result', 'search_result', 'text']);
  assert.deepEqual(content[0].content, [{ type: 'text', text: 'AA' }]);
  assert.equal(content[0].source, 'a');
  assert.equal(content[2].text, 'Q?');
  assert.deepEqual(r.output_config, { effort: 'low' });
});

test('no effort when env is empty', () => {
  assert.equal('output_config' in buildRequest({ ...config, claudeEffort: '' }, 'Q?', groups), false);
});

test('text blocks of the response are concatenated', async () => {
  const client = { messages: { create: async () => ({ content: [{ type: 'text', text: 'Hel' }, { type: 'thinking' }, { type: 'text', text: 'lo' }] }) } };
  assert.equal(await createClaude(config, client)('Q?', groups), 'Hello');
});

test('system prompt refuses off-topic requests even when results are only related', () => {
  assert.match(SYSTEM_PROMPT, /directly answers the question/);
  assert.match(SYSTEM_PROMPT, /jokes/);
  assert.match(SYSTEM_PROMPT, /passwords or credentials/);
});
