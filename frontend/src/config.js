const str = (value, fallback = '') => (value === undefined || value === '' ? fallback : value);
const num = (value, fallback) => {
  const n = Number(value);
  return value === undefined || value === '' || !Number.isFinite(n) ? fallback : n;
};

export function loadConfig(env = process.env) {
  return {
    anthropicApiKey: str(env.ANTHROPIC_API_KEY),
    claudeModel: str(env.CLAUDE_MODEL, 'claude-haiku-5-5'),
    claudeEffort: str(env.CLAUDE_EFFORT),
    claudeMaxTokens: num(env.CLAUDE_MAX_TOKENS, 1024),
    maxMessages: num(env.MAX_MESSAGES, 4),
    maxMessageChars: num(env.MAX_MESSAGE_CHARS, 200),
    vectorMinScore: num(env.VECTOR_MIN_SCORE, 0.84),
    vectorTopK: num(env.VECTOR_TOP_K, 10),
    pineconeApiKey: str(env.PINECONE_API_KEY),
    pineconeIndexName: str(env.PINECONE_INDEX_NAME),
    pineconeNamespace: str(env.PINECONE_NAMESPACE, '__default__'),
    environment: str(env.ENVIRONMENT, 'local'),
  };
}

export default loadConfig();
