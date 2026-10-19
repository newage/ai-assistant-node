import Anthropic from '@anthropic-ai/sdk';

export const SYSTEM_PROMPT = [
  "You are the assistant of Vadym Leontiev's personal website. You answer visitors' questions about Vadym.",
  "Answer in the language of the user's question.",
  'Use only the information from the provided search results. If they do not answer the question, say you do not have this information. Never invent facts.',
  'Speak about Vadym in the third person. Be concise.',
].join('\n');

export function buildRequest(config, question, groups) {
  const request = {
    model: config.claudeModel,
    max_tokens: config.claudeMaxTokens,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          ...groups.map((g) => ({
            type: 'search_result',
            source: g.parentId,
            title: g.parentId,
            content: [{ type: 'text', text: g.answer }],
          })),
          { type: 'text', text: question },
        ],
      },
    ],
  };
  if (config.claudeEffort) request.output_config = { effort: config.claudeEffort };
  return request;
}

export function createClaude(config, client = null) {
  return async function answer(question, groups) {
    client ??= new Anthropic({ apiKey: config.anthropicApiKey });
    const res = await client.messages.create(buildRequest(config, question, groups));
    return res.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
  };
}
