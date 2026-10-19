# Design

## Context

Див. `proposal.md` (Why) і `.agents/decisions/chat-endpoint.md` — журнал рішень. Стан на старті:
- Коду сервісу немає; в корені репозиторію є `package.json` (`"type": "module"`, скрипт `seed`), `scripts/seed-pinecone.js`, `data/faq.sample.json`, `.env.example`, `frontend/index.html`.
- Індекс Pinecone з integrated embedding: поле `text` ембедиться, `answer` — оригінальний текст; на FAQ-елемент 1 + N чанків з однаковим `parent_id`/`answer`.
- `frontend/index.html` зараз шле `{message, history}` на `CHAT_API_URL` (за замовчуванням `null` — демо) і на не-2xx показує загальну помилку.
- Хостинг — Vercel (Hobby). Cloudflare Workers відкинуто: free-плани Workers не запускають Node-процес/Express, а rate limit потребував би окремого сховища.

## Goals / Non-Goals

**Goals:**
- Одна папка `frontend/` — повний деплойний артефакт: статика, Node-функція, залежності. Vercel деплоїть лише її з GitHub, без Docker і CI.
- Конвеєр з окремих чистих кроків (ліміт → валідація → пошук → групування → Claude), кожен тестується без мережі.

**Non-Goals:**
- Історія діалогу, стрімінг, CORS, автентифікація, зміна даних і логіки сіду.

## Decisions

**Розкладка репозиторію.**
```
frontend/                 ← Root Directory проєкту Vercel
  public/index.html       ← статика, віддається в корені сайту
  src/index.js            ← Express app, default export (entrypoint для Vercel)
  src/local.js            ← локальний запуск: express.static('public') + listen
  src/*.js                ← config, validate, rate-limit, retrieval, claude, messages, log
  scripts/seed-pinecone.js
  test/                   ← node:test
  package.json, .env.example
data/faq.sample.json      ← лишається в корені (дані, не частина деплою)
```
Статика мусить лежати в `public/`: на Vercel `express.static()` ігнорується, а віддавати корінь `frontend/` не можна — туди потрапили б `src/`, `package.json`, `.env`. Це відхиляє раннє «index.html прямо в `frontend/`»; на хостингу `index.html` усе одно в корені сайту. Скрипт сіду переїжджає в `frontend/scripts/`, щоб бачити ті самі залежності; шлях до даних за замовчуванням `../data/faq.sample.json`.

**Хостинг: Vercel Hobby.** Root Directory = `frontend`, Framework Preset «Other», без build-команди; кожен push у GitHub — автоматичний деплой. Docker не потрібен. Ліміти (з документації): Node.js повністю, 300 с на виклик, 2 ГБ; очікування Pinecone/Claude не рахується як active CPU. Умови Hobby щодо комерційного використання перевірити окремо.

**Web-фреймворк: Express, default export у `src/index.js`** (zero-config на Vercel — стає однією функцією; `app.listen` у функції не потрібен). Альтернатива — окремі `api/*.js` без фреймворку: менше залежностей, але розбір тіла й помилок руками. Локально `src/local.js` додає `express.static('public')` і `listen`, щоб не залежати від `vercel dev`.

**Rate limit: Vercel Firewall + `@vercel/firewall`.** У панелі Vercel створюється правило з умовою `@vercel/firewall` і Rate limit ID `chat`: fixed window 600 с, 20 запитів, ключ — IP (за замовчуванням). У коді `checkRateLimit('chat', { request })` перший у конвеєрі; при `rateLimited` сервіс сам віддає 429 `{reply}` локалізованим текстом. Альтернативи: (1) WAF-правило без виклику в коді — 429 віддав би сам Vercel не нашим `{reply}`; (2) Upstash Redis — точні 20/год, але зайвий сервіс. Обмеження: лічильники рахуються по регіонах, тож загальний ліміт наближений; максимум вікна на Hobby — 10 хв, звідси «20 за 10 хв». Правило на Hobby одне на проєкт. Локально (без Vercel) перевірка ліміту відключається: `checkRateLimit` обгорнуто в модуль `rate-limit.js` з підміною в тестах і no-op поза Vercel.

**Порядок обробки: ліміт → розбір тіла → валідація.** Ліміт — перший крок; `lang` для 429 береться з тіла, якщо `express.json` його розібрав, інакше `en`. Помилка розбору JSON дає 400 `{error}`, а не 500.

**Пошук: `index.searchRecords({ query: { topK: VECTOR_TOP_K, inputs: { text } }, fields: [parent_id, answer] })`** у namespace з `PINECONE_NAMESPACE`; score — `_score` хіта. Групування: `Map` за `parent_id` з максимальним score, сортування за спаданням.

**Claude: `@anthropic-ai/sdk`, один `messages.create`** з константним `system`, одним user-повідомленням: блоки `search_result` (по групі: `source`/`title` = `parent_id`, `content` = `[{type:'text', text: answer}]`) + `text` з питанням. `model`/`max_tokens` з env; `output_config.effort` — лише якщо `CLAUDE_EFFORT` не порожній. Відповідь — конкатенація `text`-блоків. Перед реалізацією перевірити тип `search_result` у встановленій версії SDK.

**Фіксовані тексти.** Єдиний словник `messages.js` (`tooLong`, `noData`, `rateLimited`, `failure`) × `uk/en/pl`; невалідний `lang` → `en`. Текст `failure` (502) у журналі не заданий — запропоновано «Щось пішло не так, спробуйте пізніше» (Open Questions).

**Помилки upstream → 502.** Помилка/таймаут Pinecone чи Claude обгортається в один тип; причина — в лог, клієнту `{reply}`. Повторні спроби — лише вбудовані ретраї SDK. Express-обробник помилок обов'язковий (Express без нього перехоплює помилки й не дає Vercel скинути функцію).

**Логування.** `log(stage, data)` → `console.log(JSON.stringify({stage, ...}))` лише при `ENVIRONMENT !== 'production'`; ключі не логуються.

**Фронтенд.** Мінімальна правка `public/index.html`: `CHAT_API_URL = '/chat'`; запит завжди `POST /chat` з `{"messages":[{"role":"user","content":"<повідомлення користувача>","lang":"<мова сторінки>"}]}` — один елемент, історія не шлеться. `lang` — наявна змінна сторінки (`uk`/`en`/`pl`). `reply` читається і при не-2xx (400/429/502); загальна помилка — лише коли тіло не розібрати. Відносний `/chat` працює, бо сторінка і функція на одному origin.

**Деплой.** Підключити GitHub-репозиторій у Vercel, Root Directory `frontend`, Ignored Build Step «Only build if there are changes in a folder» = `frontend` (зміни поза папкою не запускають деплой), змінні середовища з `.env.example` у налаштуваннях проєкту, правило Firewall `chat`. Далі кожен push у production-гілку деплоїть сам; GitHub Actions і Docker не потрібні. `.env` локально лежить у `frontend/` і в git не потрапляє.

## Risks / Trade-offs

- [Індекс не створено з `field_map` на `text` або не засіяно] → перший запит дає 502/порожній результат; у README — крок `npm run seed` і ручний запит.
- [`VECTOR_MIN_SCORE=0.84` підібрано під іншу модель ембедингів] → може відсікати релевантне; підібрати на реальних запитах.
- [Ліміт наближений: лічильники по регіонах, одне правило на Hobby] → прийнятно для портфоліо; точніше — Upstash Redis (поза scope).
- [Правило `chat` не створено в панелі Vercel] → `checkRateLimit` не обмежує запити; створення правила — окрема задача з ручною перевіркою (21-й виклик → 429).
- [Hobby — умови щодо комерційного використання] → перевірити перед запуском.
- [Помилка конфігурації `public/` → server-код віддається як статика] → сценарій спеки «Server code is not public» і ручна перевірка після деплою.
- [Вигадування моделі попри інструкцію] → фільтр за score + системний промпт; перевіряється вручну.

## Migration Plan

1. Перенести `package.json`/lock, `scripts/`, `.env.example` у `frontend/`, `index.html` → `frontend/public/` (`git mv`).
2. Створити індекс Pinecone з `field_map` на `text`, виконати `npm run seed` з `frontend/`.
3. Локально: `npm run dev`, перевірити `GET /` і `POST /chat` вручну.
4. Vercel: підключити репозиторій (Root Directory `frontend`), додати env, створити правило Firewall `chat`; перевірити на preview-деплої, потім production. Відкат — Instant Rollback у Vercel або `CHAT_API_URL = null` (демо-режим).

## Open Questions

- Текст відповіді для 502 у трьох мовах не затверджено — запропоновано в `messages.js`, перевірити під час apply (спеку не змінює).
- Production-гілка і домен для Vercel (не впливає на код).
