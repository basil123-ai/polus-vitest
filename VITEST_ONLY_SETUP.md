# Vitest-only setup on Angular 14

How to leave a default Angular 14.2 app (Karma + Jasmine) and end with **Vitest only**.

Related:

- Story and reasoning: [VITEST_WORK_DOCUMENT.md](./VITEST_WORK_DOCUMENT.md)
- Error appendix: [VITEST_POC_DOCUMENTATION.md](./VITEST_POC_DOCUMENTATION.md)

---

## Direct answer: do we still need `setup-zone` if Karma/Jasmine are gone?

**Yes. You still need `src/setup-zone.ts`.**

Karma/Jasmine and `setup-zone.ts` solve different problems:

| Piece | What it is for | After you delete Karma? |
|--------|----------------|-------------------------|
| Karma + Jasmine packages | The **old runner** (`ng test`, Chrome, Jasmine `expect`) | **Remove.** Vitest replaces them. |
| `src/test.ts` + `karma.conf.js` | Karma bootstrap | **Remove.** |
| `zone.js` (app dependency) | Angular 14 **runtime** change detection | **Keep.** The app needs it. |
| `src/setup-zone.ts` | Wrap Vitest `it` / `describe` in Angular **ProxyZone** so `TestBed` works | **Keep.** |
| `src/test-setup.ts` | `TestBed.initTestEnvironment` + reset after each test | **Keep.** |

Angular 14 `TestBed` expects every test to run inside Zone.js **ProxyZone**.

- When you used Karma, the **Angular CLI Jasmine adapter** did that wrapping for you. You never saw a setup-zone file.
- Vitest does not know Angular. It just calls your `it()` in Node.
- Deleting Karma **removes the thing that used to wrap ProxyZone**. It does not remove Angular’s need for ProxyZone.

If you skip `setup-zone.ts` after a clean Karma removal, tests fail with:

```text
Expected to be running in 'ProxyZone', but it was not found.
```

That error is from **Angular TestBed**, not from leftover Jasmine.

`setup-zone.ts` becomes unnecessary later, on **Angular 21**, when the official `ng test` Vitest builder does this for you. On Angular 14 it is required whether Karma is installed or not.

---

## What this repo used to have vs what it has now

`ng new` (Angular 14) always generates Karma. The first Vitest wiring in this POC **added Vitest on top** and kept `npm run test:karma` as a fallback.

That dual setup is **not required**. Karma sitting unused does not help Vitest. This document is the clean path:

1. Remove every Jasmine/Karma leftover from `ng new`.
2. Add the Vitest wiring (including `setup-zone.ts`).

---

## 1) Remove all Jasmine / Karma dependencies

Do this in the target Angular 14 app root.

### 1.1 Uninstall packages

```bash
npm uninstall --save-dev karma karma-chrome-launcher karma-coverage karma-jasmine karma-jasmine-html-reporter jasmine-core @types/jasmine
```

These came from `ng new`. None of them are used by Vitest.

**Do not uninstall `zone.js`.** That is an Angular 14 **runtime** dependency (`dependencies`, not test-only). The app and `setup-zone.ts` both need it.

### 1.2 Remove npm scripts that launch Karma

In `package.json` `scripts`, delete:

```json
"test:karma": "ng test"
```

If `"test"` is still `"ng test"`, you will replace it in step 2. Do not leave `"test": "ng test"` after the Karma builder is gone — `ng test` will fail.

### 1.3 Remove the Karma test target from `angular.json`

Delete the whole `architect.test` block that looks like this:

```json
"test": {
  "builder": "@angular-devkit/build-angular:karma",
  "options": {
    "main": "src/test.ts",
    "polyfills": "src/polyfills.ts",
    "tsConfig": "tsconfig.spec.json",
    "karmaConfig": "karma.conf.js",
    ...
  }
}
```

Angular 14 has **no Vitest builder** to put here instead. Unit tests will be started with the `vitest` CLI (`npm test`), not `ng test`.

Keep `build`, `serve`, and `extract-i18n`.

### 1.4 Delete Karma bootstrap files

| File | Why it existed | After removal |
|------|----------------|---------------|
| `karma.conf.js` | Karma runner config (Chrome, Jasmine plugins) | Delete |
| `src/test.ts` | Karma entry: `initTestEnvironment` + webpack `require.context` for specs | Delete |

Vitest will not read these files. TestBed init moves to `src/test-setup.ts` in step 2.

### 1.5 Clean editor / VS Code leftovers (if present)

- `.vscode/launch.json` — remove the **ng test** config that opens `http://localhost:9876/debug.html` (Karma’s debug port).
- `.vscode/tasks.json` — remove the `npm: test` task that waits for webpack’s `bundle generation complete` (that message is Karma/CLI, not Vitest).

### 1.6 TypeScript types

In `tsconfig.spec.json`, do **not** leave `"jasmine"` in `compilerOptions.types`. After step 2 it should be:

```json
"types": ["vitest/globals", "node"]
```

`@types/jasmine` is uninstalled in 1.1, so leaving `"jasmine"` in `types` would be a broken reference.

### 1.7 What you should have after step 1

- No `karma*` / `jasmine*` packages in `package.json`
- No `karma.conf.js`, no `src/test.ts`
- No `architect.test` in `angular.json`
- App still runs: `ng serve` / `ng build` unchanged
- `ng test` **does not work** (expected). Tests come back in step 2.

---

## 2) Implement Vitest

This is the extra layer Angular 14 needs because the CLI cannot host Vitest.

### 2.1 Install the Vitest toolchain (pinned)

```bash
npm install --save-dev vitest@1.6.1 vite@5.4.11 jsdom@24.1.3 @analogjs/vite-plugin-angular@0.1.1 @vitest/coverage-v8@1.6.1 --legacy-peer-deps
```

Pin `@types/node@18` if install pulled a newer one (TypeScript 4.7 breaks on modern Node types).

| Package | Why |
|---------|-----|
| `vitest` | Runner (replaces Karma) |
| `vite` | Bundler Vitest uses (does **not** replace `ng serve` / `ng build`) |
| `jsdom` | Fake DOM (replaces Chrome) |
| `@analogjs/vite-plugin-angular@0.1.1` | Compile Angular templates for Vite. Newer Analog needs Angular 17+. |
| `@vitest/coverage-v8` | Coverage |

Do **not** install `@analogjs/vitest-angular` on Angular 14 (needs DevKit 15+).

### 2.2 Create `vite.config.ts`

Copy from this repo. Required behaviour:

- Analog plugin **must** use `tsconfig.spec.json` (app tsconfig excludes `*.spec.ts` → 0 tests).
- `globals: true` — so `setup-zone.ts` can patch the same global `it` / `describe`.
- `environment: 'jsdom'`
- `setupFiles: ['src/test-setup.ts']`
- `pool: 'forks'` + `singleFork: true` (Zone.js + parallel workers is unsafe)

### 2.3 Create `src/setup-zone.ts` — **required without Karma**

Copy from this repo. Do not skip this because Jasmine is gone.

**What we did:** patch Vitest globals so each test body runs inside Angular `ProxyZone`.

**Why we did:** Karma’s Jasmine adapter used to do this. After step 1, nothing else does. Angular 14 TestBed still requires it.

Also keep the `__vitest_zone_patch__` guard (Vitest can load setup files twice).

**Do not** `import { it, describe } from 'vitest'` in specs. That bypasses the patch.

### 2.4 Create `src/test-setup.ts` — **required without Karma**

Copy from this repo.

**What we did:**

1. `import './setup-zone'` first.
2. `TestBed.initTestEnvironment(...)` once (this used to live in `src/test.ts`).
3. `afterEach(() => TestBed.resetTestingModule())`.

**Why we did:** deleting `src/test.ts` removed Angular’s test-platform bootstrap. Vitest will not call it unless we do it in a setup file. Reset is still required between tests.

### 2.5 Update `tsconfig.spec.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/spec",
    "types": ["vitest/globals", "node"]
  },
  "files": ["src/test-setup.ts"],
  "include": ["src/**/*.spec.ts", "src/**/*.d.ts"]
}
```

Root `tsconfig.json` should have `"skipLibCheck": true` so `ng build` survives Vitest’s Node types.

### 2.6 Update `package.json` scripts

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

There is no `test:karma`. There is no `ng test`.

### 2.7 Specs (optional in this step)

New tests: Vitest globals + `vi.spyOn` + `TestBed`. Do not use Jasmine APIs.

If old Jasmine specs still exist, they may fail until rewritten. Wiring is still correct if Vitest starts, finds files, and does not throw ProxyZone / TestBed-already-instantiated from **setup**.

---

## Files after a clean setup

**Removed (Karma / Jasmine)**

- `karma.conf.js`
- `src/test.ts`
- `angular.json` → `architect.test`
- packages: `karma`, `karma-*`, `jasmine-core`, `@types/jasmine`
- script: `test:karma`

**Added (Vitest wiring — keep until Angular 21)**

| File | Still needed if Karma is gone? |
|------|--------------------------------|
| `vite.config.ts` | Yes |
| `src/setup-zone.ts` | **Yes** (ProxyZone for TestBed) |
| `src/test-setup.ts` | **Yes** (replaces `src/test.ts`) |

**Unchanged**

- Application source
- `ng serve` / `ng build` (still Angular CLI / webpack)
- `zone.js` in `dependencies`

---

## Commands

```bash
npm test               # Vitest, one run
npm run test:watch     # Vitest watch
npm run test:coverage  # Coverage
npm start              # App (unchanged)
npm run build          # Production build (must stay green)
```

`ng test` is expected to fail: there is no Karma builder left.

---

## Check: did we actually need Karma leftover?

No. This POC originally kept Karma as a safety net. That was optional. Vitest does not use those packages.

What looked like “Karma options still in the project” was:

- `package.json` scripts + karma/jasmine packages
- `angular.json` `test` architect
- `karma.conf.js` + `src/test.ts`

None of that feeds `vite.config.ts`. Removing it does **not** let you drop `setup-zone.ts`.
