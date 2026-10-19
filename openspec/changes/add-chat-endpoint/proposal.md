# Proposal

## Why

Сайт-візитка (`frontend/index.html`) має чат «Ask my AI assistant», але працює лише в демо-режимі (`CHAT_API_URL = null`, заготовлені відповіді). Відвідувач не може поставити реальне питання про досвід Вадима, а відповідь має спиратися лише на факти з бази знань, без вигадок моделі.

## What Changes

- Новий Node-сервіс: один `POST /chat` (`{messages:[{role,content,lang}]}` → `{reply}`), що шукає в Pinecone (integrated embedding), відсікає хіти за `VECTOR_MIN_SCORE`, групує чанки за `parent_id` і одним викликом Claude формує відповідь лише з знайденого контексту.
- Детерміновані фіксовані тексти (uk/en/pl; невалідний `lang` → en) для: відсутності даних (200), надто довгого повідомлення (400), перевищення ліміту (429), збою Pinecone/Claude (502).
- Rate limit: 20 викликів за 10 хвилин на IP (правило Vercel Firewall + перевірка в коді через `@vercel/firewall`).
- Усе деплойне лежить в одній папці `frontend/` (статика в `frontend/public/`, Node-код і залежності поруч) і викладається на Vercel (Root Directory = `frontend`, деплой із GitHub без Docker і CI). Статика й `/chat` на одному origin, CORS не потрібен.
- Структурований `console.log` кожного етапу, коли `ENVIRONMENT != production`.
- Адаптація `frontend/index.html` до контракту: формат тіла запиту, `lang`, показ `reply` також для не-2xx відповідей, `CHAT_API_URL = '/chat'`.
- Скрипт сіду `scripts/seed-pinecone.js` вже існує (окрема попередня робота) — не змінюється.

## Capabilities

### New Capabilities
- `chat-answering`: контракт `POST /chat` — валідація, вибір останнього повідомлення, пошук у Pinecone з порогом і групуванням, відповідь Claude лише за знайденим контекстом, фіксовані відмови й помилки за мовою.
- `chat-abuse-protection`: ліміт викликів на IP (20 за 10 хв) і відповідь 429.

### Modified Capabilities
<!-- немає: openspec/specs порожній -->

## Impact

- Новий код сервісу (Node, ESM) у `frontend/`; `package.json`, `scripts/seed-pinecone.js` і `index.html` переїжджають у `frontend/` (`index.html` → `frontend/public/`); залежності: `@pinecone-database/pinecone`, `@anthropic-ai/sdk`, `express`, `@vercel/firewall`.
- `frontend/public/index.html` — блок налаштувань чату і `getReply`/`send`.
- `.env.example` переїжджає в `frontend/`; у проді змінні задаються в налаштуваннях проєкту Vercel.
- Зовнішні системи: Vercel (хостинг, Firewall), Pinecone (індекс з `field_map` на `text`, наповнений `npm run seed`), Anthropic API (витрати — обмежує rate limit).
- Поза scope: історія діалогу, стрімінг, CORS, автентифікація, зміна даних/сіду.
