import { checkRateLimit } from '@vercel/firewall';

export const RATE_LIMIT_ID = 'chat';

// `check` is replaceable in tests; off Vercel (local run) the limit is not applied.
export function createRateLimiter({ check = checkRateLimit, enabled = Boolean(process.env.VERCEL), log = () => {} } = {}) {
  return async function isRateLimited(headers) {
    if (!enabled) return false;
    try {
      const { rateLimited, error } = await check(RATE_LIMIT_ID, { headers });
      if (error) log('rate-limit-error', { error });
      return rateLimited === true;
    } catch (err) {
      log('rate-limit-error', { error: String(err?.message ?? err) });
      return false;
    }
  };
}
