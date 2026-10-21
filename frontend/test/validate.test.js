import { test, expect } from '@jest/globals';
import { validate } from '../src/validate.js';
import { TEXTS } from '../src/messages.js';

const limits = { maxMessages: 4, maxMessageChars: 200 };
const msg = (content, extra = {}) => ({ role: 'user', content, lang: 'en', ...extra });

test('valid request returns question and lang', () => {
  expect(validate({ messages: [msg('  Who? ', { lang: 'uk' })] }, limits)).toStrictEqual({ question: 'Who?', lang: 'uk' });
});

test('missing or empty messages -> 400 error', () => {
  for (const body of [undefined, {}, { messages: [] }, { messages: 'x' }]) {
    const r = validate(body, limits);
    expect(r.status).toBe(400);
    expect(r.body.error).toBeTruthy();
  }
});

test('empty or whitespace content -> 400 error', () => {
  for (const content of ['', '   ', undefined]) {
    const r = validate({ messages: [msg(content)] }, limits);
    expect(r.status).toBe(400);
    expect(r.body.error).toBeTruthy();
  }
});

test('last role not user -> 400 error', () => {
  const r = validate({ messages: [msg('hi', { role: 'assistant' })] }, limits);
  expect(r.status).toBe(400);
  expect(r.body.error).toBeTruthy();
});

test('MAX_MESSAGES + 1 -> 400 reply in message language', () => {
  const messages = Array.from({ length: 5 }, () => msg('hi', { lang: 'uk' }));
  const r = validate({ messages }, limits);
  expect(r.status).toBe(400);
  expect(r.body.reply).toBe(TEXTS.tooLong.uk);
});

test('too long content (any element) -> 400 reply', () => {
  const r = validate({ messages: [msg('x'.repeat(201), { role: 'assistant' }), msg('hi')] }, limits);
  expect(r.status).toBe(400);
  expect(r.body.reply).toBe(TEXTS.tooLong.en);
});

test('invalid lang is not an error', () => {
  expect(validate({ messages: [msg('hi', { lang: 'de' })] }, limits)).toStrictEqual({ question: 'hi', lang: 'en' });
});
