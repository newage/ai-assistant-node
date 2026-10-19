# Tasks

Межі зміни: чіпаємо `frontend/` (новий склад: `public/`, `src/`, `scripts/`, `test/`, `package.json`, `.env.example`, `README.md`), `.gitignore`, `CLAUDE.md`. Переносимо з кореня: `package.json`/`package-lock.json`, `scripts/seed-pinecone.js`, `.env.example`, `frontend/index.html` → `frontend/public/`. **Не чіпаємо:** `data/` (лишається в корені), `openspec/specs/`, верстку й демо-відповіді `KB` в `index.html`, логіку сіду (лише шлях до даних за замовчуванням).

## 1. Розкладка і каркас

- [x] 1.1 Перенести через `git mv` у `frontend/`: `package.json`, `package-lock.json`, `scripts/`, `.env.example`; `frontend/index.html` → `frontend/public/index.html`; у сіді змінити шлях за замовчуванням на `../data/faq.sample.json`; `.gitignore`: `frontend/node_modules/`, `frontend/.env`; перевірити: `cd frontend && npm ci && npm run seed -- --dry-run` друкує 310 записів, у корені репозиторію немає `package.json` і `node_modules`.
- [x] 1.2 Додати у `frontend/package.json` залежності `express`, `@anthropic-ai/sdk`, `@vercel/firewall` і скрипти `dev` (`node --env-file=.env src/local.js`), `test` (`node --test`); перевірити: `npm install`, `npm test` (порожній прогін) без помилок.
- [x] 1.3 Створити `src/config.js`: читає env з `.env.example` (`VECTOR_TOP_K` за замовчуванням 10), порожні значення → дефолти, числа парсяться; перевірити `test/config.test.js` (дефолти, порожній `CLAUDE_EFFORT`).
- [x] 1.4 Створити `src/log.js` (JSON у `console.log`, нічого при `ENVIRONMENT=production`); перевірити тестом з підміною `console.log`.

## 2. Тексти і валідація

- [x] 2.1 Створити `src/messages.js`: `tooLong`, `noData`, `rateLimited`, `failure` × `uk/en/pl` (тексти з `design.md` і `.agents/propose/setup.md`), `resolveLang(lang)` з фолбеком `en`; перевірити тестом: усі 12 текстів непорожні, `de`/`undefined` → англійська.
- [x] 2.2 Створити `src/validate.js` за вимогами `chat-answering` (Request validation, Message length limits): повертає `{status, body}` або `{question, lang}`; перевірити `test/validate.test.js` по сценаріях: порожній `content` → 400 `{error}`, остання роль не `user` → 400, `MAX_MESSAGES+1` → 400 `{reply}`, надто довгий `content` → 400 `{reply}`, невалідний `lang` — не помилка.

## 3. Ліміт викликів

- [x] 3.1 Створити `src/rate-limit.js`: обгортка над `checkRateLimit('chat', { request })` з `@vercel/firewall` з можливістю підміни; поза Vercel (локально) — no-op; перевірити `test/rate-limit.test.js` з підробленим перевіряльником: `rateLimited: true` → ознака ліміту, `false` → пропуск, помилка перевірки не валить запит (логується, запит пропускається).

## 4. Пошук і Claude

- [x] 4.1 Створити `src/retrieval.js`: `search(text)` через `index.searchRecords` (`topK=VECTOR_TOP_K`, namespace з env), фільтр `score >= VECTOR_MIN_SCORE`, групування за `parent_id` з максимальним score і сортуванням (чисті функції фільтра/групування окремо); перевірити `test/retrieval.test.js` без мережі: три чанки одного `parent_id` → одна група, хіти нижче порога відсікаються, порядок за score.
- [x] 4.2 Створити `src/claude.js`: один `messages.create` із константним `system`, блоками `search_result` і `text` з питанням, `output_config.effort` лише якщо задано; перед написанням перевірити тип `search_result` у встановленому `@anthropic-ai/sdk`; перевірити тестом з підробленим клієнтом: форма запиту (блоки, порядок, модель/ліміт токенів), відсутність `effort` при порожньому env, склеювання `text`-блоків відповіді.

## 5. Маршрут і сервер

- [x] 5.1 Створити `src/index.js` (Express app, `export default app`, без `listen`) і `src/local.js` (`express.static('public')` + `listen`): порядок ліміт → розбір тіла → валідація → пошук → (немає даних → 200 `noData`) → Claude; помилки Pinecone/Claude → 502 `{reply: failure}` з логом причини; помилка розбору JSON → 400 `{error}`; обробник помилок Express; логування етапів; перевірити інтеграційним `test/chat.test.js` (підроблені `rate-limit`/`retrieval`/`claude`) по сценаріях обох спек: 200 з відповіддю, 200 «немає даних» без виклику Claude, 400, 429 (у т.ч. невалідне тіло понад ліміт → 429), 502.
- [x] 5.2 Ручна перевірка локально з реальними Pinecone/Claude (потрібні ключі в `frontend/.env`): `npm run seed`, `npm run dev`, `curl` питання з сіду (відповідь за змістом), питання поза темою (фіксована відмова), довге повідомлення (400); результати записати в `README.md`.

## 6. Фронтенд

- [x] 6.1 Адаптувати `frontend/public/index.html` (блок налаштувань чату і `getReply`/`send`): `CHAT_API_URL = '/chat'`; запит строго `POST /chat` з тілом `{"messages":[{"role":"user","content":"<текст користувача>","lang":"<мова сторінки>"}]}` — завжди один елемент, без `history`; `lang` береться з наявної змінної `lang` сторінки; `reply` читається і при не-2xx, загальна помилка — лише коли тіло не розібрати; оновити коментар про формат запиту; перевірити в браузері (DevTools → Network): після зміни мови на `uk` тіло містить `"lang":"uk"` і один елемент `messages`, відповідь показується, 400 показує текст сервера, демо-відповіді `KB` не змінені; `grep` по `frontend/public/` не знаходить посилань на файли поза папкою.

## 7. Деплой і документація

- [x] 7.1 Налаштувати Vercel: підключити GitHub-репозиторій, Root Directory `frontend`, Framework Preset «Other» без build-команди, Ignored Build Step = «Only build if there are changes in a folder» зі значенням `frontend` (Settings → Build and Deployment), env з `.env.example` у налаштуваннях проєкту, правило Firewall (умова `@vercel/firewall`, Rate limit ID `chat`, fixed window 600 с, 20 запитів, ключ IP); перевірити: коміт, що змінює лише файл поза `frontend/` (наприклад, у `openspec/`), не запускає новий деплой (скасований або пропущений), а коміт у `frontend/` запускає; на preview-деплої `GET /` віддає сторінку, чат відповідає, 21-й виклик за 10 хв → 429 з локалізованим `reply`, а `/src/index.js`, `/package.json`, `/.env` не віддаються.
- [x] 7.2 Додати `frontend/README.md`: змінні середовища, `npm run seed`, `npm run dev`, `npm test`, вимога до індексу (`field_map` на `text`), кроки деплою з 7.1 (Root Directory `frontend`, правило Firewall), що Docker і CI не потрібні; оновити `CLAUDE.md` (розділ «Current state»: розкладка, команди build/test, запуск одного тесту `node --test test/<file>`); перевірити, що команди з README виконуються як написано.

## Workflow follow-up

- Синхронізувати delta-специфікації в основні (`/opsx:sync`) і архівувати зміну після ревʼю.
