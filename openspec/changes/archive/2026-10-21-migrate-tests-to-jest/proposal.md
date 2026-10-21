# Proposal

## Why

Tests currently run on the built-in `node:test` + `node:assert/strict`. Jest is needed: a familiar runner with built-in `expect`/mocks, a watch mode and a coverage report. The change is purely tooling — the service behavior does not change.

## What Changes

- Add `jest` as a devDependency in `frontend/package.json`.
- Add a Jest config for the ESM project (`"type": "module"`), without Babel/transpilation.
- Rewrite all 9 files `frontend/test/*.test.js` from `node:test`/`assert` to Jest (`test`, `expect`, `jest.spyOn`).
- Change `npm test` to run Jest.
- Update the mentions of `node:test` / `node --test` in `CLAUDE.md`, `README.md`, `frontend/README.md`.
- Tests stay network-free; the number and content of the checks are preserved 1:1.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
<!-- none: only the test tooling changes, system requirements do not. `skip_specs: true` in .openspec.yaml -->

## Impact

- `frontend/package.json` (+ `package-lock.json`): devDependency `jest`, the `test` script.
- `frontend/jest.config.js` (new) or a `jest` section in `package.json`.
- `frontend/test/*.test.js` (9 files, ~515 lines).
- Documentation: `CLAUDE.md`, `README.md`, `frontend/README.md`.
- Not touched: `frontend/src/`, `frontend/scripts/`, `frontend/public/`, `data/`, `vercel.json`. Deploy does not change: `jest` is only a dev dependency, and Vercel installs via `npm ci`.
