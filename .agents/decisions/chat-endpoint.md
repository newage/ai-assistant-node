# Журнал рішень: Node-сервіс чату з RAG (Pinecone + Claude)

## Проблема
На сайті-візитці (`frontend/index.html`) є заклик «Ask my AI assistant», але бекенду немає. Відвідувач не може поставити питання про досвід Вадима, а відповідь має спиратися лише на факти з бази знань, без вигадок моделі. Без змін асистент лишається декоративним.

## Дано
- Репозиторій без коду, лише `frontend/index.html` — перевірено: `ls frontend`
- `openspec/config.yaml` є, активних змін немає; зміну OpenSpec не заводимо (режим без OpenSpec)
- Один `POST /chat`, тіло `{messages:[{role,content,lang}]}`, `lang` ∈ uk/en/pl, відповідь `{reply}` — `.agents/propose/setup.md`
- Ключ LLM — `ANTHROPIC_API_KEY` (підтверджено користувачем; `OPENAI_API_KEY` у setup.md — описка)
- Ембединги вбудовані в Pinecone (текстовий запит, без зовнішньої моделі ембедингів)
- Хостинг — Vercel: деплоїться лише папка `frontend/` (Root Directory), статика в `frontend/public/`, Node-функція `/chat` на тому ж домені → CORS не потрібен; Docker і CI не потрібні
- Історії діалогу немає: обробляється лише одне (останнє) повідомлення
- Лог: структурований `console.log` кожного етапу, коли `ENVIRONMENT != production`
- Env у `.env.example`: `CLAUDE_MODEL`, `CLAUDE_EFFORT`, `CLAUDE_MAX_TOKENS`, `MAX_MESSAGES`, `MAX_MESSAGE_CHARS`, `VECTOR_MIN_SCORE`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `ENVIRONMENT`

## Концепт рішення
**Обрано:** прямий конвеєр: Pinecone завжди першим, фільтр за score, Claude отримує лише фрагменти вище порогу.
**Чий:** запропонував розробник (setup.md)
**Чому:** детермінована відмова з фіксованими текстами, один виклик LLM, передбачувана вартість.
**Відкинуто:**
- Tool use (Claude сам вирішує, чи шукати) — 2 виклики, тексти відмови не фіксовані, складніше гарантувати «лише з бази».

## Вектор
```
Браузер ──POST /chat──▶ Vercel (один домен; GET / → frontend/public/index.html, POST /chat → Node-функція)
  1 rate limit за IP (429)  →  2 валідація (400)  →  3 беремо останнє повідомлення
  4 Pinecone search (integrated embedding, VECTOR_TOP_K)
  5 hits з score >= VECTOR_MIN_SCORE, згруповані за parent_id (однаковий answer) ?
      немає → 200 {reply: фікс. текст за lang}
      є     → 6 Claude (system + search_result-блоки з `answer` + питання) → 200 {reply}
  збій Pinecone/Claude на 4 або 6 → 502 {reply: фікс. текст за lang}
  кожен етап → console.log (структурований), якщо ENVIRONMENT != production
Наповнення індексу — `scripts/seed-pinecone.js` (окремо від сервісу).
```
- Тіло запиту може містити кілька повідомлень, але обробляється лише останнє; решта лише валідується за `MAX_MESSAGES` і `MAX_MESSAGE_CHARS`.
- Свідомо не робимо: історію діалогу, стрімінг, CORS, автентифікацію.

## Деталі
### Схема записів Pinecone і `top_k`
**Рішення:** `top_k` — параметр запиту, а не поле запису; виноситься в env `VECTOR_TOP_K`. Джерело даних — `data/faq.sample.json` (42 FAQ-елементи: `parent_id,type,project,lang,text,questions`, див. «Seed індексу»).
**Чому:** `top_k` не є властивістю даних, у вибірці його й не має бути.

### Збій Pinecone/Claude
**Рішення:** HTTP 502 і той самий `{reply}` фіксованим текстом мовою `lang`; причина пишеться в лог.
**Чому:** користувач бачить звичний текст, а збої видно в статусах.
**Альтернатива:** 200 + фікс. текст — збій не відрізнити від «немає інформації».

### Захист від зловживань
**Рішення:** 20 викликів за 10 хвилин на IP: правило Vercel Firewall (Rate limit ID `chat`) + `checkRateLimit` з `@vercel/firewall` у коді, понад ліміт — наш 429 `{reply}`. Ліміт у пам'яті не підходить: функції Vercel не гарантують один екземпляр.
**Чому:** публічний ендпоінт, кожен запит може коштувати виклик Claude.
**Обмеження:** на Hobby вікно максимум 10 хв, лічильники по регіонах (ліміт наближений). **Альтернативи:** без ліміту — ризик рахунку; Upstash Redis — точні 20/год, але зайвий сервіс.

### Валідація довжини
**Рішення:** `messages` довше за `MAX_MESSAGES` або `content` довше за `MAX_MESSAGE_CHARS` → HTTP 400 і `{reply}` (як і в інших відмов — фронт показує `reply`) мовою `lang`:
- uk: «Повідомлення занадто довге. Будь ласка, переформулюйте запитання коротше.»
- en: «Your message is too long. Please rephrase your question to make it shorter.»
- pl: «Wiadomość jest zbyt długa. Przeformułuj pytanie, aby było krótsze.»
**Чому:** користувач бачить, що робити; без виклику Pinecone і Claude.

### Ліміт і невалідний `lang`
**Рішення:** 429 віддає `{reply}` мовою `lang`:
- uk: «Забагато запитів. Будь ласка, спробуйте пізніше.»
- en: «Too many requests. Please try again later.»
- pl: «Zbyt wiele zapytań. Spróbuj ponownie później.»

Якщо `lang` відсутній чи поза uk/en/pl — усі фіксовані тексти (400, 429, 502, відмова) віддаються англійською. Ліміт перевіряється до валідації, тож `lang` для 429 беремо з тіла, якщо воно читається, інакше `en`.

### Seed індексу
**Рішення:** на кожен FAQ-елемент 1 + N чанків (приклад — `.agents/propose/example-chank.md`): `_id` = `<parent_id>-NN` (01 — оригінальний текст, 02.. — питання). Ембедиться поле `text` (чанк 01 — оригінал, решта — питання), у всіх чанках `answer` = оригінальний текст, плюс `parent_id`, `type`, `lang`, `project` (null не пишемо). Індекс створюється окремо з `field_map` на `text` (`PINECONE_TEXT_FIELD`); namespace — `PINECONE_NAMESPACE`. Запуск: `npm run seed` (`-- --dry-run` лише рахує).
**Чому:** питання користувача ближчі до питань із FAQ, ніж до тексту відповіді; чанк 01 ловить запити, схожі на сам текст.
**Наслідок для /chat:** у Claude йде поле `answer`; кілька чанків одного `parent_id` можуть потрапити в top_k — після фільтра за score групуємо за `parent_id` (в усіх однаковий `answer`), у Claude іде одне входження на групу; порядок груп — за найвищим score в групі. Якщо після фільтра групи порожні — фіксована відмова. Записи, видалені з JSON, самі з індексу не зникають.

### Запит до Claude
**Рішення:** `system` — константа: «Answer in the language of the user’s message. Use only the retrieved context. You are Vadym’s assistant, answer about him in third person.» Єдине user-повідомлення містить блоки `search_result` (по одному на групу `parent_id`: `source`/`title` = `parent_id`, `content` = поле `answer`), а останнім — `text` з питанням користувача. `citations` не вмикаємо.
**Чому:** інструкції, дані з RAG і питання лежать у окремих місцях; мова відповіді визначається повідомленням, а `lang` потрібен лише для фіксованих текстів відмови й помилки.
**Наслідок:** `CLAUDE_EFFORT` передається як `output_config.effort`; порожнє значення — параметр не передаємо.

## Відкриті питання
- ~~Формат даних в індексі і seed~~ — вирішено, див. «Seed індексу» нижче.
- `VECTOR_TOP_K=10` — стартове значення (чанки одного `parent_id` займають місця в top_k); підібрати на реальних даних.

## Припущення
- CORS не налаштовуємо (один origin).
- Валідація: порожній `content` → 400 з `{error}`; `lang` поза uk/en/pl не помилка — відповідаємо англійською (не блокує). Надто довгий `content` або `messages` довше за `MAX_MESSAGES` → 400 з `{reply}` фіксованим текстом за `lang` (див. «Валідація довжини»).
- Останнє повідомлення має `role: user`; інакше 400 (не блокує).
- Нові env у `.env.example`: `VECTOR_TOP_K`; `OPENAI_API_KEY` із setup.md — описка, використовується `ANTHROPIC_API_KEY`.
