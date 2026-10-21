import express from 'express';
import { fileURLToPath } from 'node:url';
import config from './config.js';
import { createLog } from './log.js';
import { text } from './messages.js';
import { validate, validateReaction } from './validate.js';
import { createRateLimiter } from './rate-limit.js';
import { createRetrieval } from './retrieval.js';
import { createClaude } from './claude.js';
import { createDb, NotConfiguredError } from './db.js';

export function createApp(deps = {}) {
  const log = deps.log ?? createLog(config.environment);
  const isRateLimited = deps.isRateLimited ?? createRateLimiter({ log });
  const search = deps.search ?? createRetrieval(config);
  const answer = deps.answer ?? createClaude(config);
  const record = deps.record ?? createDb(config).record;

  // Awaited before responding: a Vercel function may be frozen right after the response.
  async function logUnanswered(question, reply) {
    try {
      await record({ question, answer: reply, reaction: null });
    } catch (err) {
      log('record-error', { error: String(err?.message ?? err) });
    }
  }

  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
  const parseJson = express.json();

  // A body parse error is kept for later: the call limit is checked before the body is judged.
  app.post('/chat', (req, res, next) => parseJson(req, res, (err) => { req.bodyError = err; next(); }));

  app.post('/chat', async (req, res, next) => {
    try {
      const lang = req.body?.messages?.at?.(-1)?.lang;
      log('received', { lang });

      if (await isRateLimited(req.headers)) {
        log('response', { status: 429 });
        return res.status(429).json({ reply: text('rateLimited', lang) });
      }
      if (req.bodyError) {
        log('response', { status: 400, error: 'invalid JSON' });
        return res.status(400).json({ error: 'request body must be valid JSON' });
      }

      const checked = validate(req.body, config);
      if (checked.status) {
        log('response', { status: checked.status });
        return res.status(checked.status).json(checked.body);
      }
      const { question, lang: msgLang } = checked;
      req.question = question;
      log('validated', { question, lang: msgLang });

      let groups;
      try {
        const found = await search(question);
        groups = found.groups;
        log('search', { hits: found.hits, groups: groups.map((g) => ({ parentId: g.parentId, score: g.score })) });
      } catch (err) {
        return await upstreamFailure(res, log, logUnanswered, question, msgLang, 'pinecone', err);
      }

      if (groups.length === 0) {
        const noData = text('noData', msgLang);
        await logUnanswered(question, noData);
        log('response', { status: 200, noData: true });
        return res.json({ reply: noData });
      }

      let reply;
      try {
        log('claude', { model: config.claudeModel, groups: groups.length });
        reply = await answer(question, groups);
      } catch (err) {
        return await upstreamFailure(res, log, logUnanswered, question, msgLang, 'claude', err);
      }
      log('response', { status: 200 });
      return res.json({ reply });
    } catch (err) {
      next(err);
    }
  });

  app.post('/answer', (req, res, next) => express.json()(req, res, (err) => {
    if (err) {
      log('response', { status: 400, error: 'invalid JSON' });
      return res.status(400).json({ error: 'request body must be valid JSON' });
    }
    next();
  }));

  app.post('/answer', async (req, res) => {
    const checked = validateReaction(req.body, config);
    if (checked.status) {
      log('response', { status: checked.status });
      return res.status(checked.status).json(checked.body);
    }
    try {
      await record(checked);
    } catch (err) {
      log('record-error', { error: String(err?.message ?? err) });
      const status = err instanceof NotConfiguredError ? 503 : 500;
      return res.status(status).json({ error: status === 503 ? 'reactions are not available' : 'could not save reaction' });
    }
    log('response', { status: 201, reaction: checked.reaction });
    return res.status(201).json({});
  });

  // Without this Express would swallow the error instead of letting Vercel reset the function.
  app.use(async (err, req, res, next) => {
    log('error', { error: String(err?.message ?? err) });
    if (res.headersSent) return next(err);
    if (req.question) await logUnanswered(req.question, null);
    return res.status(500).json({ reply: text('failure', req.body?.messages?.at?.(-1)?.lang) });
  });

  return app;
}

async function upstreamFailure(res, log, logUnanswered, question, lang, source, err) {
  log('upstream-error', { source, error: String(err?.message ?? err) });
  await logUnanswered(question, null);
  return res.status(502).json({ reply: text('failure', lang) });
}

export default createApp();
