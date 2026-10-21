import { neon } from '@neondatabase/serverless';

export class NotConfiguredError extends Error {
  constructor() {
    super('DATABASE_URL is not configured');
    this.name = 'NotConfiguredError';
  }
}

export function createDb(config, sql = null) {
  const getSql = () => {
    if (!sql) {
      if (!config.databaseUrl) throw new NotConfiguredError();
      sql = neon(config.databaseUrl);
    }
    return sql;
  };

  async function record({ question, answer = null, reaction = null }) {
    const db = getSql();
    await db`INSERT INTO reactions (question, answer, reaction) VALUES (${question}, ${answer}, ${reaction})`;
  }

  return { record };
}
