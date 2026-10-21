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

const REACTIONS = ['good', 'bad'];
const isText = (v) => typeof v === 'string' && v.trim() !== '';

export function validateReaction(body, { maxMessageChars, maxAnswerChars }) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest('body must be a JSON object');
  }
  const { question, answer, reaction } = body;
  if (!isText(question)) return badRequest('question must be a non-empty string');
  if (!isText(answer)) return badRequest('answer must be a non-empty string');
  if (question.length > maxMessageChars) return badRequest('question is too long');
  if (answer.length > maxAnswerChars) return badRequest('answer is too long');
  if (!REACTIONS.includes(reaction)) return badRequest('reaction must be "good" or "bad"');
  return { question, answer, reaction };
}
