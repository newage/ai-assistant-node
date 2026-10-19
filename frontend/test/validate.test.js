import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/validate.js';
import { TEXTS } from '../src/messages.js';

const limits = { maxMessages: 4, maxMessageChars: 200 };
const msg = (content, extra = {}) => ({ role: 'user', content, lang: 'en', ...extra });

test('valid request returns question and lang', () => {
  assert.deepEqual(validate({ messages: [msg('  Who? ', { lang: 'uk' })] }, limits), { question: 'Who?', lang: 'uk' });
});

test('missing or empty messages -> 400 error', () => {
  for (const body of [undefined, {}, { messages: [] }, { messages: 'x' }]) {
    const r = validate(body, limits);
    assert.equal(r.status, 400);
    assert.ok(r.body.error);
  }
});

test('empty or whitespace content -> 400 error', () => {
  for (const content of ['', '   ', undefined]) {
    const r = validate({ messages: [msg(content)] }, limits);
    assert.equal(r.status, 400);
    assert.ok(r.body.error);
  }
});

test('last role not user -> 400 error', () => {
  const r = validate({ messages: [msg('hi', { role: 'assistant' })] }, limits);
  assert.equal(r.status, 400);
  assert.ok(r.body.error);
});

test('MAX_MESSAGES + 1 -> 400 reply in message language', () => {
  const messages = Array.from({ length: 5 }, () => msg('hi', { lang: 'uk' }));
  const r = validate({ messages }, limits);
  assert.equal(r.status, 400);
  assert.equal(r.body.reply, TEXTS.tooLong.uk);
});

test('too long content (any element) -> 400 reply', () => {
  const r = validate({ messages: [msg('x'.repeat(201), { role: 'assistant' }), msg('hi')] }, limits);
  assert.equal(r.status, 400);
  assert.equal(r.body.reply, TEXTS.tooLong.en);
});

test('invalid lang is not an error', () => {
  assert.deepEqual(validate({ messages: [msg('hi', { lang: 'de' })] }, limits), { question: 'hi', lang: 'en' });
});
