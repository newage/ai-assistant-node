## Change boundaries

We touch only: `frontend/package.json`, `frontend/package-lock.json`, `frontend/jest.config.js` (new), `frontend/test/*.test.js`, `CLAUDE.md`, `README.md`, `frontend/README.md`.
We do not touch: `frontend/src/`, `frontend/scripts/`, `frontend/public/`, `data/`, `vercel.json`, `openspec/specs/`. Do not change what exactly the tests check and do not add new tests.

## 1. Connecting Jest

- [x] 1.1 In `frontend/` run `npm i -D jest` (updates `package.json` and `package-lock.json`).
- [x] 1.2 Create `frontend/jest.config.js` per decision 3 in design.md (`export default`, `testEnvironment: 'node'`, `testMatch`, `transform: {}`).
- [x] 1.3 In `frontend/package.json` change `scripts.test` to `node --experimental-vm-modules node_modules/jest/bin/jest.js` (following the existing `node --env-file=…` scripts).

## 2. Rewriting the tests

For each file: replace the `node:test` / `node:assert/strict` imports with `@jest/globals`, the assertions — per the mapping in design.md (decision 4), do not change test names and data. After each file run `npm test -- test/<file>`.

- [x] 2.1 `frontend/test/validate.test.js`
- [x] 2.2 `frontend/test/messages.test.js`
- [x] 2.3 `frontend/test/config.test.js`
- [x] 2.4 `frontend/test/rate-limit.test.js`
- [x] 2.5 `frontend/test/claude.test.js`
- [x] 2.6 `frontend/test/retrieval.test.js`
- [x] 2.7 `frontend/test/seed-lib.test.js`
- [x] 2.8 `frontend/test/log.test.js` — the only one with mocks: `jest.spyOn(console, 'log').mockImplementation(() => {})` per decision 5.
- [x] 2.9 `frontend/test/chat.test.js` — the largest (138 lines); keep the `call()` helper with `app.listen(0)` and `fetch` as is, change only the imports and assertions.

## 3. Documentation

- [x] 3.1 `CLAUDE.md`: the `frontend/test/` line (`node:test` → Jest) and the single-file command line (`npm test -- test/<file>`).
- [x] 3.2 `README.md`: the table ("Tests" row), the directory tree and the test-run block.
- [x] 3.3 `frontend/README.md`: the directory tree and the `npm test` / single-file run block.

## 4. Verification

- [x] 4.1 `cd frontend && npm test` — all 9 files pass, without the network; the number of tests matches what it was on `node --test` before the start (take the number before the migration).
- [x] 4.2 `grep -rn "node:test\|node --test" frontend/ CLAUDE.md README.md --exclude-dir=node_modules` — empty.
