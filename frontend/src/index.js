import express from 'express';
import { fileURLToPath } from 'node:url';
import config from './config.js';
import { createLog } from './log.js';
import { text } from './messages.js';
import { validate } from './validate.js';
import { createRateLimiter } from './rate-limit.js';
import { createRetrieval } from './retrieval.js';
import { createClaude } from './claude.js';

export function createApp(deps = {}) {
  const log = deps.log ?? createLog(config.environment);
  const isRateLimited = deps.isRateLimited ?? createRateLimiter({ log });
  const search = deps.search ?? createRetrieval(config);
  const answer = deps.answer ?? createClaude(config);

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
      log('validated', { question, lang: msgLang });

      let groups;
      try {
        const found = await search(question);
        groups = found.groups;
        log('search', { hits: found.hits, groups: groups.map((g) => ({ parentId: g.parentId, score: g.score })) });
      } catch (err) {
        return upstreamFailure(res, log, msgLang, 'pinecone', err);
      }

      if (groups.length === 0) {
        log('response', { status: 200, noData: true });
        return res.json({ reply: text('noData', msgLang) });
      }

      let reply;
      try {
        log('claude', { model: config.claudeModel, groups: groups.length });
        reply = await answer(question, groups);
      } catch (err) {
        return upstreamFailure(res, log, msgLang, 'claude', err);
      }
      log('response', { status: 200 });
      return res.json({ reply });
    } catch (err) {
      next(err);
    }
  });

  // Without this Express would swallow the error instead of letting Vercel reset the function.
  app.use((err, req, res, next) => {
    log('error', { error: String(err?.message ?? err) });
    if (res.headersSent) return next(err);
    return res.status(500).json({ reply: text('failure', req.body?.messages?.at?.(-1)?.lang) });
  });

  return app;
}

function upstreamFailure(res, log, lang, source, err) {
  log('upstream-error', { source, error: String(err?.message ?? err) });
  return res.status(502).json({ reply: text('failure', lang) });
}

export default createApp();
