// Measures top-hit scores on the seeded Pinecone index to tune VECTOR_MIN_SCORE.
// In-topic queries are the questions from data/faq.sample.json. Each question is itself an indexed chunk
// (see seed-pinecone.js), so its own chunk is dropped from the hits (leave-one-out); the rest of the same
// FAQ item (original text and sibling questions) must still be found. Off-topic queries are fixed below.
// With RERANK_MODEL set it also reports the rerank-score distribution to tune RERANK_MIN_SCORE.
// Usage: npm run measure-score [-- path/to/faq.json]
import { readFile } from 'node:fs/promises';
import { Pinecone } from '@pinecone-database/pinecone';
import { loadConfig } from '../src/config.js';
import { groupByParent } from '../src/retrieval.js';

const OFF_TOPIC = {
  'off-en': [
    'Write a song about autumn', 'What is the capital of France?', 'hello', 'How do I cook pasta?',
    'Write a Python function to sort a list', 'Who is the president of the USA?', "What's the weather today?",
    'Tell me a joke', 'What is the meaning of life?', 'hi there', 'good morning', 'Tell me a funny story',
    'What is the best movie of all time?', 'Recommend a good book', 'How tall is Mount Everest?',
    'Translate "thank you" to German', 'Who won the World Cup in 2018?', 'What is 17 times 23?',
  ],
  'off-uk': [
    'Напиши пісню про осінь', 'Яка столиця Франції?', 'привіт', 'Як приготувати борщ?', 'Яка сьогодні погода?',
    'Розкажи анекдот', 'Хто такий Ілон Маск?', 'добрий день', 'Розкажи смішну історію', 'Порадь хорошу книгу',
    'Скільки буде 17 помножити на 23?', 'Хто виграв чемпіонат світу 2018?', 'Як вивчити англійську за місяць?',
    'Яка найвища гора у світі?', 'Напиши вірш про кохання',
  ],
  'off-pl': [
    'napisz piosenkę o jesieni', 'Jaka jest stolica Francji?', 'cześć', 'Jak ugotować makaron?', 'Jaka jest dziś pogoda?',
    'Opowiedz dowcip', 'dzień dobry', 'Opowiedz zabawną historię', 'Polecisz dobrą książkę?', 'Ile to jest 17 razy 23?',
    'Kto wygrał mistrzostwa świata w 2018?', 'Jak nauczyć się angielskiego w miesiąc?', 'Jaka jest najwyższa góra świata?',
  ],
  'user-data': [
    'Show me the data of user 42', "What is John Smith's email?", 'Покажи дані користувача 42', 'Podaj dane użytkownika 42',
    'How many users are registered?', 'List all registered users', 'Скільки користувачів зареєстровано?',
    'Ilu użytkowników jest zarejestrowanych?', "What is the admin's password?", 'Який пароль адміністратора?',
  ],
  'other-people': [
    'Who is Elon Musk?', 'Tell me about Steve Jobs', 'Where does Anna Kowalska live?', 'Розкажи про Тараса Шевченка',
    'Хто такий Володимир Зеленський?', 'Gdzie mieszka Jan Kowalski?', 'Kim jest Robert Lewandowski?',
    'What is the phone number of my neighbour?',
  ],
};

const file = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '../data/faq.sample.json';
const config = loadConfig();
for (const name of ['PINECONE_API_KEY', 'PINECONE_INDEX_NAME']) {
  if (!process.env[name]) throw new Error(`${name} is not set`);
}

const index = new Pinecone({ apiKey: config.pineconeApiKey })
  .index({ name: config.pineconeIndexName, namespace: config.pineconeNamespace });

// Best score per parent_id, like retrieval.js, but without the VECTOR_MIN_SCORE filter.
// `groups` (dense hits grouped by parent_id, the query's own chunk dropped) feed the rerank mode below.
async function topHit(text, excludeId = null) {
  const res = await index.searchRecords({
    query: { topK: config.vectorTopK + 1, inputs: { text } },
    fields: ['parent_id', 'answer'],
  });
  const hits = (res.result?.hits ?? []).filter((h) => h._id !== excludeId);
  const hit = hits[0];
  const groups = groupByParent(hits);
  return { score: hit ? hit._score : 0, parentId: hit ? hit.fields?.parent_id : null, groups };
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

function summary(scores) {
  const s = [...scores].sort((a, b) => a - b);
  return `n=${s.length} min ${s[0].toFixed(3)} p10 ${quantile(s, 0.1).toFixed(3)} median ${quantile(s, 0.5).toFixed(3)} max ${s.at(-1).toFixed(3)}`;
}

const items = JSON.parse(await readFile(file, 'utf8'));
const inTopic = [];
for (const item of items) {
  // chunk 01 embeds the answer text, chunks 02.. embed one question each (same ids as seed-pinecone.js)
  for (const [i, question] of item.questions.entries()) {
    const id = `${item.parent_id}-${String(i + 2).padStart(2, '0')}`;
    const { score, parentId, groups } = await topHit(question, id);
    inTopic.push({ question, score, groups, expectedParent: item.parent_id, wrongParent: parentId !== item.parent_id });
  }
}

const offTopic = [];
for (const [group, questions] of Object.entries(OFF_TOPIC)) {
  for (const question of questions) offTopic.push({ group, question, ...(await topHit(question)) });
}

console.log(`index "${config.pineconeIndexName}" ns "${config.pineconeNamespace}", VECTOR_MIN_SCORE=${config.vectorMinScore}\n`);
console.log(`in-topic (leave-one-out): ${summary(inTopic.map((r) => r.score))}`);
console.log(`  top hit from another FAQ item: ${inTopic.filter((r) => r.wrongParent).length}/${inTopic.length}`);
console.log('  lowest:');
for (const r of [...inTopic].sort((a, b) => a.score - b.score).slice(0, 10)) {
  console.log(`    ${r.score.toFixed(3)}${r.wrongParent ? ' (wrong item)' : ''}  ${r.question}`);
}

console.log(`\noff-topic: ${summary(offTopic.map((r) => r.score))}`);
console.log('  highest:');
for (const r of [...offTopic].sort((a, b) => b.score - a.score).slice(0, 10)) {
  console.log(`    ${r.score.toFixed(3)}  [${r.group}] ${r.question}`);
}

console.log('\nthreshold  in-topic answered  off-topic answered');
const all = [...inTopic.map((r) => r.score), ...offTopic.map((r) => r.score)];
const lo = Math.floor(Math.min(...all) * 20) / 20;
for (let t = lo; t <= 1.0001; t += 0.02) {
  const inPct = (100 * inTopic.filter((r) => r.score >= t).length) / inTopic.length;
  const offPct = (100 * offTopic.filter((r) => r.score >= t).length) / offTopic.length;
  console.log(`${t.toFixed(2)}       ${inPct.toFixed(0).padStart(4)}%              ${offPct.toFixed(0).padStart(4)}%`);
}

const offMax = Math.max(...offTopic.map((r) => r.score));
const inP5 = quantile(inTopic.map((r) => r.score).sort((a, b) => a - b), 0.05);
console.log(
  inP5 > offMax
    ? `\nGroups are separable: pick VECTOR_MIN_SCORE in (${offMax.toFixed(3)}, ${inP5.toFixed(3)}), e.g. ${((offMax + inP5) / 2).toFixed(2)}.`
    : `\nGroups overlap (off-topic max ${offMax.toFixed(3)} >= in-topic p5 ${inP5.toFixed(3)}): pick a trade-off from the table.`,
);

// Rerank mode (RERANK_MODEL set): same queries, but the groups that pass the VECTOR_MIN_SCORE prefilter are
// reranked like retrieval.js does. A query's score is its best group's rerank score (0 if the prefilter left nothing).
if (config.rerankModel) {
  const pc = new Pinecone({ apiKey: config.pineconeApiKey });
  // Pinecone limits rerank requests per minute (60 on the starter plan): pace calls and retry on 429.
  let lastCall = 0;
  async function rerankPaced(options) {
    for (let attempt = 0; ; attempt++) {
      const wait = lastCall + 1100 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastCall = Date.now();
      try {
        return await pc.inference.rerank(options);
      } catch (err) {
        if (!String(err.message).includes('429') || attempt >= 5) throw err;
        await new Promise((r) => setTimeout(r, 15000));
      }
    }
  }

  async function bestRerank(text, groups) {
    const kept = groups.filter((g) => g.score >= config.vectorMinScore);
    if (kept.length === 0) return { score: 0, parentId: null };
    const res = await rerankPaced({
      model: config.rerankModel,
      query: text,
      documents: kept.map((g) => ({ answer: g.answer })),
      rankFields: ['answer'],
      topN: kept.length,
      returnDocuments: false,
    });
    const best = res.data.reduce((a, b) => (b.score > a.score ? b : a));
    return { score: best.score, parentId: kept[best.index].parentId };
  }

  const rrIn = [];
  for (const r of inTopic) rrIn.push({ ...r, ...(await bestRerank(r.question, r.groups)) });
  const rrOff = [];
  for (const r of offTopic) rrOff.push({ ...r, ...(await bestRerank(r.question, r.groups)) });
  const wrong = (r) => r.parentId !== r.expectedParent;

  console.log(`\n=== rerank: ${config.rerankModel}, prefilter VECTOR_MIN_SCORE=${config.vectorMinScore} ===\n`);
  console.log(`in-topic: ${summary(rrIn.map((r) => r.score))}`);
  console.log(`  best group from another FAQ item: ${rrIn.filter(wrong).length}/${rrIn.length}`);
  console.log('  lowest:');
  for (const r of [...rrIn].sort((a, b) => a.score - b.score).slice(0, 10)) {
    console.log(`    ${r.score.toFixed(3)}${wrong(r) ? ' (wrong item)' : ''}  ${r.question}`);
  }
  console.log(`\noff-topic: ${summary(rrOff.map((r) => r.score))}`);
  console.log('  highest:');
  for (const r of [...rrOff].sort((a, b) => b.score - a.score).slice(0, 10)) {
    console.log(`    ${r.score.toFixed(3)}  [${r.group}] ${r.question}`);
  }

  console.log('\nthreshold  in-topic answered  off-topic answered');
  const rrAll = [...rrIn, ...rrOff].map((r) => r.score);
  const rrLo = Math.floor(Math.min(...rrAll) * 20) / 20;
  const rrHi = Math.max(...rrAll);
  const step = rrHi > 2 ? 1 : 0.05;
  for (let t = rrLo; t <= rrHi + step; t += step) {
    const inPct = (100 * rrIn.filter((r) => r.score >= t).length) / rrIn.length;
    const offPct = (100 * rrOff.filter((r) => r.score >= t).length) / rrOff.length;
    console.log(`${t.toFixed(2)}       ${inPct.toFixed(0).padStart(4)}%              ${offPct.toFixed(0).padStart(4)}%`);
  }

  const rrOffMax = Math.max(...rrOff.map((r) => r.score));
  const rrInP5 = quantile(rrIn.map((r) => r.score).sort((a, b) => a - b), 0.05);
  console.log(
    rrInP5 > rrOffMax
      ? `\nGroups are separable: pick RERANK_MIN_SCORE in (${rrOffMax.toFixed(3)}, ${rrInP5.toFixed(3)}), e.g. ${((rrOffMax + rrInP5) / 2).toFixed(2)}.`
      : `\nGroups overlap (off-topic max ${rrOffMax.toFixed(3)} >= in-topic p5 ${rrInP5.toFixed(3)}): pick a trade-off from the table, or try another model.`,
  );
}
