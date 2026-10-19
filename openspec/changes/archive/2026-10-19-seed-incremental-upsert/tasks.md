# Tasks

## 1. Перевірка припущень про Pinecone

- [x] 1.1 На реальному індексі (`.env`) виконати одноразовий скрипт у scratchpad: `index.fetch({ ids: ['profile-summary-01'] })`; перевірити, що `records[id].metadata` містить `answer`, `lang`, `type`, і чи повертається `text`. Верифікація: результат записано в нотатку design.md (Risks). Файли проєкту не змінюються.

## 2. Модуль сіду і тести

Межі: чіпаємо лише `frontend/scripts/seed-pinecone.js`, новий `frontend/scripts/seed-lib.js`, новий `frontend/test/seed-lib.test.js`. Не чіпаємо `src/`, `data/`, `public/`.

- [x] 2.1 Створити `frontend/scripts/seed-lib.js`: перенести `toRecords` з `seed-pinecone.js` без зміни логіки id/полів; додати `content_hash` (sha256 від JSON `[embedded, answer, lang, type, project ?? null]`) у кожен запис. Верифікація: `node --test test/seed-lib.test.js` (ids `a-01..`, `answer` у всіх чанках, `project` відсутнє при `null`, дублі id → помилка).
- [x] 2.2 Додати в `seed-lib.js` чисту `diffRecords(records, existing)` → `{ toSend, newCount, changedCount, unchangedCount }`; відсутній запис = new, відсутній або інший `content_hash` = changed. Верифікація: тести на сценарії специфікації «нічого не змінилось», «нове питання в кінці», «змінився text → усі чанки item», «змінився lang», «старий запис без hash», «видалене питання не впливає».
- [x] 2.3 Додати `fetchExisting(index, ids)`: пачки по 100 через `index.fetch({ ids })`, збирає `records` у мапу `id → metadata`. Верифікація: тест із фейковим `index` (250 id → 3 виклики; відповіді зливаються; помилка fetch піднімається вгору).

## 3. Entry-скрипт

- [x] 3.1 Переписати `frontend/scripts/seed-pinecone.js` на `seed-lib.js`: прочитати JSON, зібрати записи, при наявності ключів прочитати індекс і порахувати diff, надрукувати `N new, M changed, K unchanged`, відправити лише `toSend` пачками по 96. Без ключів і при `--dry-run`: друкувати кількість записів як раніше. Верифікація: `npm run seed -- --dry-run` без `.env` друкує `310 records ...`, `npm test` зелений.
- [x] 3.2 Помилка `fetch` завершує скрипт ненульовим кодом без upsert; видалення в скрипті відсутнє. Верифікація: перегляд diff скрипта + тест на `fetchExisting` з помилкою (2.3).
- [x] 3.3 Ручна перевірка на реальному індексі: перший `npm run seed` відправляє 310 (усі «changed»), другий друкує `0 new, 0 changed, 310 unchanged` і нічого не відправляє, після додавання одного питання в кінець `questions` у `data/faq.sample.json` третій відправляє рівно 1 запис. Верифікація: вивід трьох запусків; тестове питання потім прибрати з JSON.

## 4. Документація

- [x] 4.1 Оновити `frontend/README.md` (розділ seed, рядки про `--dry-run` та `npm run seed`): інкрементальна поведінка, підсумок, перший запуск відправляє все, нові питання додавати в кінець `questions`, видалення записів не підтримується (як прибрати вручну). Верифікація: описані команди виконуються як написано, число записів у README відповідає виводу dry-run.
