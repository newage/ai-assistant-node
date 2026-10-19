# frontend — сайт-візитка і `POST /chat`

Уся деплойна частина проєкту: статика (`public/`), Node-сервіс чату (`src/`), залежності і тести. На Vercel деплоїться лише ця папка (Root Directory = `frontend`), без Docker і CI.

```
public/index.html        статика, віддається в корені сайту
src/index.js             Express app (default export, entrypoint для Vercel)
src/local.js             локальний запуск: express.static('public') + listen
src/*.js                 config, log, messages, validate, rate-limit, retrieval, claude
scripts/seed-pinecone.js наповнення індексу Pinecone з ../data/faq.sample.json
test/                    node:test
```

## Як працює `POST /chat`

Запит `{"messages":[{"role":"user","content":"...","lang":"uk"}]}` (`lang`: `uk`/`en`/`pl`, інакше `en`), відповідь `{"reply":"..."}`. Обробляється лише останнє повідомлення.

Конвеєр: ліміт викликів → розбір тіла → валідація → пошук у Pinecone (хіти з `score >= VECTOR_MIN_SCORE`, групування за `parent_id`) → один виклик Claude лише з знайденим контекстом.

| Статус | Коли | Тіло |
|---|---|---|
| 200 | відповідь, або немає релевантних даних (фіксований текст, Claude не викликається) | `{reply}` |
| 400 | порожній `content`, остання роль не `user`, не JSON | `{error}` |
| 400 | забагато повідомлень / задовгий `content` | `{reply}` |
| 429 | понад 20 викликів за 10 хв з IP | `{reply}` |
| 502 | збій Pinecone або Claude (причина в лозі) | `{reply}` |

## Змінні середовища

Шаблон — `.env.example`; локально копія в `.env` (не потрапляє в git), на Vercel — у налаштуваннях проєкту.

| Змінна | Призначення |
|---|---|
| `ANTHROPIC_API_KEY` | ключ Anthropic |
| `CLAUDE_MODEL`, `CLAUDE_MAX_TOKENS` | модель і ліміт вихідних токенів |
| `CLAUDE_EFFORT` | `low`…`max`; порожнє — не передається |
| `MAX_MESSAGES`, `MAX_MESSAGE_CHARS` | ліміти розміру запиту |
| `VECTOR_MIN_SCORE`, `VECTOR_TOP_K` | поріг релевантності і кількість хітів |
| `PINECONE_API_KEY`, `PINECONE_INDEX_NAME` | доступ до індексу |
| `PINECONE_TEXT_FIELD`, `PINECONE_NAMESPACE` | поле для сіду; namespace (порожній = `__default__`) |
| `ENVIRONMENT` | `production` вимикає логи етапів у `console.log` |

## Команди

```bash
cd frontend
cp .env.example .env     # заповнити ключі
npm ci
npm run seed -- --dry-run   # лише показати записи (310)
npm run seed                # наповнити Pinecone
npm run dev                 # http://localhost:3000
npm test                    # усі тести
node --test test/validate.test.js   # один файл
```

Локально через Docker: `docker compose -f docker/docker-compose.yml up` (з кореня репозиторію). Контейнер сам виконує `npm install && npm run dev`.

Локально (поза Vercel) ліміт викликів вимкнений.

## Індекс Pinecone

Індекс з integrated embedding: `field_map` має вказувати на поле `text`. На кожен FAQ-елемент є 1 + N чанків з однаковими `parent_id` та `answer`. Індекс створюється вручну, далі `npm run seed`.

## Деплой на Vercel

1. Підключити GitHub-репозиторій, **Root Directory** = `frontend`, Framework Preset «Other», без build-команди.
2. Settings → Build and Deployment → **Ignored Build Step** = «Only build if there are changes in a folder», значення `frontend`.
3. Додати змінні з `.env.example` у налаштування проєкту.
4. Firewall: правило з умовою `@vercel/firewall`, Rate limit ID `chat`, fixed window 600 с, 20 запитів, ключ — IP.
5. Перевірити на preview-деплої: `GET /` віддає сторінку, чат відповідає, 21-й виклик за 10 хв → 429, а `/src/index.js`, `/package.json`, `/.env` не віддаються.

Далі кожен push деплоїть сам. Відкат — Instant Rollback або `CHAT_API_URL = null` в `public/index.html` (демо-режим). Ліміт наближений (лічильники по регіонах).

## Ручна перевірка (локально, реальні Pinecone і Claude)

Після `npm run seed` (310 записів) і `npm run dev`, `POST /chat`:

| Запит | Результат |
|---|---|
| `Who is Vadym Leontiev?` (en) | 200, відповідь за змістом `profile-summary` (top score ≈ 0.91) |
| `Де Вадим працював 13 років?` (uk) | 200, відповідь українською про Englishdom (top score ≈ 0.87) |
| `What is the capital of France?` (pl) | 200, фіксований текст «немає інформації» польською, Claude не викликався (жодного хіта ≥ 0.84) |
| `content` довжиною 201 символ | 400 `{reply}` «message too long» |
