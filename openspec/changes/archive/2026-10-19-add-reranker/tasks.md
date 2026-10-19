zr# Tasks

## 1. Config

- [x] 1.1 У `frontend/src/config.js` додати `rerankModel` (`RERANK_MODEL`, порожнє = вимкнено) і `rerankMinScore` (`RERANK_MIN_SCORE`, числовий дефолт з `num`), за зразком `vectorMinScore`. Перевірка: `node --test test/config.test.js` з новими кейсами (дефолти, значення з env, порожній рядок).
- [x] 1.2 Додати обидві змінні в `frontend/.env.example` з коментарем, що `VECTOR_MIN_SCORE` при увімкненому реранкері є грубим префільтром. Перевірка: файл містить обидва ключі й пояснення.

## 2. Retrieval

- [x] 2.1 У `createRetrieval` (`frontend/src/retrieval.js`) приймати `rerank` (функція, за замовчуванням через `pc.inference.rerank`) так само, як `index`, щоб тести працювали без мережі. Не чіпати `filterHits` і `groupByParent`.
- [x] 2.2 Після `groupByParent(filterHits(...))` і лише коли `config.rerankModel` непорожнє та груп більше нуля: викликати rerank із `query=text`, `documents` = унікальні `answer` груп, `rankFields: ['answer']`, `topN` = кількість груп; замінити score груп на rerank-score, відфільтрувати `>= rerankMinScore`, відсортувати за ним. Без груп rerank не викликається. Повертати ту саму форму `{hits, groups}`.
- [x] 2.3 Помилку rerank не перехоплювати в `retrieval.js`, щоб вона піднялась до наявної обробки 502. Перевірка: тест у `retrieval.test.js`, що відхилений rerank дає відхилений `search`.
- [x] 2.4 Тести в `frontend/test/retrieval.test.js` (фейк rerank): вимкнено = rerank не викликано; група з високим dense, але низьким rerank відсікається; порядок за rerank-score; три чанки одного `parent_id` дають один документ у rerank; порожні групи не викликають rerank. Перевірка: `node --test test/retrieval.test.js`.
- [x] 2.5 У `frontend/test/chat.test.js` додати кейс: усі групи відсіяні rerank дає 200 з текстом «немає інформації» і без виклику Claude; відхилений rerank дає 502. Перевірка: `node --test test/chat.test.js`, потім `npm test` проходить повністю.

## 3. Калібрування

- [x] 3.1 Перед вибором моделі звірити з поточною документацією Pinecone (скіл `context7-mcp`) список rerank-моделей, їхню підтримку uk/pl і ліміт довжини документа, і записати вибір у `design.md` (Open Questions). Перевірка: рядок у `design.md` із моделлю й обґрунтуванням.
- [x] 3.2 Розширити off-topic вибірку в `frontend/scripts/measure-score.js` (ціль: щонайменше 60 запитів, en/uk/pl, з жартами, привітаннями, питаннями про користувачів, питаннями про інших людей). Перевірка: скрипт виводить `n=` не менше 60 для off-topic.
- [x] 3.3 У `measure-score.js` додати режим rerank: коли `RERANK_MODEL` задано, для кожного запиту (з відкиданням власного чанка, як зараз) групувати dense-хіти, реранкувати й виводити для in-topic та off-topic розподіл rerank-score, найнижчі in-topic, найвищі off-topic, таблицю порогів і рекомендацію діапазону `RERANK_MIN_SCORE`. Dense-вивід не змінювати. Перевірка: `npm run measure-score` з `RERANK_MODEL` і без нього.
- [x] 3.4 Додати перефразування (en/uk/pl) до дев'яти записів з найнижчим dense-score в `data/faq.sample.json`, засидити (`npm run seed`) і перемірити dense (`npm run measure-score` без `RERANK_MODEL`). Результат записаний у `design.md`. Калібрування `RERANK_MIN_SCORE` винесено з цієї зміни (див. Статус у `design.md`).

## 4. Системний промпт і документація

- [x] 4.1 У `SYSTEM_PROMPT` (`frontend/src/claude.js`) додати правило: відповідати лише коли результат прямо відповідає на питання, інакше сказати, що інформації немає; тест у `frontend/test/claude.test.js`. Перевірка: `npm test` проходить, ручна перевірка на жарті/паролі.
- [x] 4.2 Оновити `frontend/README.md` (env, роль `VECTOR_MIN_SCORE`, калібрування через `npm run measure-score`, rollback очищенням `RERANK_MODEL`) і опис pipeline в кореневому `README.md` та `CLAUDE.md`. Перевірка: описані команди виконуються як записано.
