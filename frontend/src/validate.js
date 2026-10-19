import { text, resolveLang } from './messages.js';

const badRequest = (error) => ({ status: 400, body: { error } });

export function validate(body, { maxMessages, maxMessageChars }) {
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return badRequest('messages must be a non-empty array');
  }

  const last = messages[messages.length - 1];
  const lang = resolveLang(last?.lang);
  if (typeof last?.content !== 'string' || last.content.trim() === '') {
    return badRequest('last message content must be a non-empty string');
  }
  if (last.role !== 'user') {
    return badRequest('last message role must be "user"');
  }

  const tooLong =
    messages.length > maxMessages ||
    messages.some((m) => typeof m?.content === 'string' && m.content.length > maxMessageChars);
  if (tooLong) {
    return { status: 400, body: { reply: text('tooLong', lang) } };
  }

  return { question: last.content.trim(), lang };
}
