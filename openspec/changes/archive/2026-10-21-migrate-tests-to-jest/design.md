# Design

## Context

The project is Node 24, pure ESM (`"type": "module"`), no build. Tests use `node:test` (`test`, once `mock`) and `node:assert/strict` (`equal`, `deepEqual`, etc.). The only place with runtime mocks is `test/log.test.js` (`mock.method(console, 'log')`, `spy.mock.callCount()`, `spy.mock.calls[0].arguments[0]`, `spy.mock.restore()`). The other tests pass fake dependencies by hand (DI via `createApp`, `createRateLimiter`, etc.), so `jest.mock` of modules is not needed.

## Goals / Non-Goals

**Goals:** Jest as the only runner; native ESM without Babel; 1:1 preservation of the checks.
**Non-Goals:** changing `src/`; adding coverage or new tests; switching to `jest.mock` instead of the existing DI; CI.

## Decisions

1. **Native ESM via `NODE_OPTIONS=--experimental-vm-modules`.** Script: `"test": "node --experimental-vm-modules node_modules/jest/bin/jest.js"`. The alternative — Babel (`babel-jest`) — adds dependencies and a build, which the project avoids. Jest ESM is still marked experimental; this is an acceptable risk, recorded here.
2. **Import `jest` explicitly:** `import { jest, test, expect } from '@jest/globals'` — in ESM the global `jest` is unavailable, and explicit imports match the current explicit `node:test` imports.
3. **Config:** `frontend/jest.config.js` (ESM, `export default`) with `testEnvironment: 'node'`, `testMatch: ['<rootDir>/test/**/*.test.js']`, `transform: {}` (disable Babel).
4. **Assertion mapping** (`assert/strict` → `expect`):
   - `equal(a, b)` → `expect(a).toBe(b)`
   - `deepEqual(a, b)` → `expect(a).toEqual(b)` (the strict semantics of `deepStrictEqual` are closer to `toStrictEqual` — use it where the difference between undefined/classes matters)
   - `ok(x)` → `expect(x).toBeTruthy()`
   - `throws`/`rejects` → `expect(() => …).toThrow()` / `await expect(p).rejects.toThrow()`
   - `match(s, re)` → `expect(s).toMatch(re)`
5. **`console.log` mocks:** `mock.method(console,'log',fn)` → `jest.spyOn(console,'log').mockImplementation(() => {})`; `callCount()` → `toHaveBeenCalledTimes`; `calls[0].arguments[0]` → `mock.calls[0][0]`; `mock.restore()` → `spy.mockRestore()`.
6. **A single file:** `node --test test/<file>` → `npm test -- test/<file>`.
7. **Ports in `chat.test.js`:** tests listen on port `0` and call `fetch` — Jest workers run in parallel, but the ports are ephemeral, so there is no conflict. Global `fetch` is available in Node 24 in the Jest `node` environment.

## Risks / Trade-offs

- Jest's ESM support is experimental → a warning may appear in the console; accepted.
- `toEqual` is less strict than `deepStrictEqual` → where `undefined` fields are compared, use `toStrictEqual`.
- A new dev dependency grows `node_modules` (the deploy is not affected: not used at runtime).
