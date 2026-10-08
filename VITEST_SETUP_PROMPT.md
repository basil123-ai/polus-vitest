# Prompt: wire Vitest on an Angular 14 app (config only)

Copy everything below the line into a new chat **after** the target Angular app is in the workspace. Replace the two paths if needed.

---

## Prompt (copy from here)

You are setting up **Vitest as the unit-test runner** on an existing Angular application. This is **wiring / infrastructure only**.

### Goal

Make `npm test` run **Vitest** (not Karma) with Angular `TestBed` working (ProxyZone + TestBed reset). Do **not** write new unit tests. Do **not** rewrite or convert existing Jasmine/Karma specs.

### Reference implementation (source of truth)

A working Angular 14 + Vitest POC already exists in this workspace:

- **Reference root:** `d:\Personal\polus-vitest` (package name `test-vitest-poc`)
- **Docs:** `d:\Personal\polus-vitest\VITEST_ONLY_SETUP.md` (remove Karma, then add Vitest)

**Copy the wiring from that repo. Do not invent a different stack.** Do not modify the reference project.

**Target app root:** `<PASTE TARGET PROJECT PATH HERE>`

Work only inside the target app unless you need to **read** the reference.

### Hard constraints

1. **No new `*.spec.ts` / `*.test.ts` files.**
2. **Do not edit existing spec files** (leave Jasmine `spyOn` / `fail` / `jasmine.*` as-is).
3. **Do not change application source** (components, services, modules, templates, routing).
4. **Remove Karma/Jasmine completely.** Do not keep `test:karma` or the `angular.json` Karma builder. Angular 14 has no Vitest `ng test` builder — tests run via `vitest` CLI only.
5. **Do not use** `@analogjs/vitest-angular` or latest Analog. Those need Angular 15+/17+.
6. **Do not** `import { describe, it, expect } from 'vitest'` in setup files in a way that bypasses the Zone patch. Specs must use **Vitest globals**.
7. If the target Angular major version is **not 14**, stop and report. This prompt is for **Angular 14 only**.

### First step — inspect the target

Read and report:

- `@angular/core` version
- TypeScript version
- `sourceRoot` / whether it is an app vs library / monorepo project
- Current `package.json` `test` script
- Current `tsconfig.spec.json` and `tsconfig.json`
- Whether `src/test.ts` + `karma.conf.js` exist

If Angular is not 14.x, **stop**. If it is a multi-project workspace, apply wiring to the **application project** the user cares about (adjust paths: `tsconfig.spec.json`, `src/` vs `projects/<name>/src/`).

### Exact packages to install (target `package.json`)

From the target app root, install **these pinned versions** (use `--legacy-peer-deps` if peer conflicts appear):

```bash
npm install --save-dev vitest@1.6.1 vite@5.4.11 jsdom@24.1.3 @analogjs/vite-plugin-angular@0.1.1 @vitest/coverage-v8@1.6.1 --legacy-peer-deps
```

Also pin **`@types/node@18`** (e.g. `@types/node@^18.19.68`) if newer `@types/node` is pulled in. TypeScript ~4.7 breaks on modern Node types (`Disposable`, etc.).

**Remove Karma/Jasmine packages** (they came from `ng new` and are unused):

```bash
npm uninstall --save-dev karma karma-chrome-launcher karma-coverage karma-jasmine karma-jasmine-html-reporter jasmine-core @types/jasmine
```

Do **not** uninstall `zone.js`. **Do not skip `src/setup-zone.ts`.** That file is for Angular TestBed ProxyZone, not for Jasmine. See `VITEST_ONLY_SETUP.md`.

### Files to create (copy from reference, adapt paths only)

Create these in the **target** app, using the **same content** as the reference unless a path must change (monorepo `src` location):

| File | Copy from |
|------|-----------|
| `vite.config.ts` | `d:\Personal\polus-vitest\vite.config.ts` |
| `src/setup-zone.ts` | `d:\Personal\polus-vitest\src\setup-zone.ts` |
| `src/test-setup.ts` | `d:\Personal\polus-vitest\src\test-setup.ts` |

Required `vite.config.ts` behavior:

- `plugins: [angular({ tsconfig: './tsconfig.spec.json' })]` — **must** be spec tsconfig, not `tsconfig.app.json`, or Vitest finds 0 tests.
- `test.globals: true`
- `test.environment: 'jsdom'`
- `test.setupFiles: ['src/test-setup.ts']` (adjust if `sourceRoot` differs)
- `test.include` matching existing specs (`src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}` or the monorepo equivalent)
- `test.pool: 'forks'` and `poolOptions.forks.singleFork: true` (Zone.js is not safe with parallel workers)
- coverage provider `v8` if you add coverage script

`src/test-setup.ts` must:

1. `import './setup-zone'` first
2. `TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting())` if platform not already set
3. `afterEach(() => TestBed.resetTestingModule())`

`src/setup-zone.ts` must stay a ProxyZone patch of Vitest globals (`describe` / `it` / `test` / hooks) with `__vitest_zone_patch__` guard. Copy the reference file; do not “simplify” it.

### Files to update

**`package.json` scripts** (keep other scripts):

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

**`tsconfig.spec.json`:**

- `"types": ["vitest/globals", "node"]` (remove `"jasmine"` from this file’s `types` so the IDE uses Vitest globals)
- `"files": ["src/test-setup.ts"]` (path-adjusted)
- `"include"`: existing `*.spec.ts` plus `*.d.ts`

**Delete** `src/test.ts` and `karma.conf.js`. They are Karma-only.

**Root `tsconfig.json`:**

- Set `"skipLibCheck": true` if not already set (avoids `@types/node` / TS 4.7 build break).

Do **not** change `tsconfig.app.json` to include spec files.

**`angular.json`:** delete the `architect.test` Karma target. Do not replace it — Angular 14 cannot run Vitest through `ng test`.

### Known failures you must prevent

| Symptom | Cause | Fix (already in reference) |
|---------|--------|----------------------------|
| `No test suite found` / 0 tests | Analog used app tsconfig | `angular({ tsconfig: './tsconfig.spec.json' })` |
| `Expected to be running in 'ProxyZone'` | Vitest does not wrap tests in Zone | `setup-zone.ts` + do not import `it`/`describe` from `vitest` |
| `Cannot configure the test module when the test module has already been instantiated` | TestBed not reset | `afterEach(() => TestBed.resetTestingModule())` in `test-setup.ts` |
| `'vitest' has already been patched with 'Zone'` | setup file ran twice | `__vitest_zone_patch__` guard |
| `ng build` dies on `@types/node` (`Disposable`, etc.) | modern Node types + TS 4.7 | pin `@types/node@18` + `skipLibCheck` |
| Peer dependency errors | Analog/Vite vs Angular 14 | `--legacy-peer-deps` |

### What success looks like (no new tests)

1. `npm test` **starts Vitest** (not Karma/Chrome).
2. Vitest **discovers** existing `*.spec.ts` files (count > 0).
3. Failures from **Jasmine-only APIs** in old specs (`spyOn` without `vi`, `jasmine.createSpy`, `fail()`) are **acceptable**. Do not fix those specs.
4. Wiring bugs are **not** acceptable: ProxyZone missing, 0 files found, TestBed already instantiated from setup (not from a bad spec), Analog compile errors on the plugin/tsconfig, `ng build` broken by `@types/node`.
5. `npm run build` still succeeds.
6. Karma/Jasmine packages, `karma.conf.js`, `src/test.ts`, and `angular.json` `test` target are gone. `setup-zone.ts` is still present.

If there are **zero** spec files, `npm test` may exit with “no test files”. That is OK. Do **not** add a smoke spec unless the user asks.

### Deliverable when done

- List of files created/changed
- Confirm Angular version and that packages match the pins above
- Output of `npm test` and `npm run build`
- Short note: existing Jasmine specs were left untouched; they can be rewritten to Vitest later

---

## After you paste

1. Put the other Angular app in the same Cursor workspace.
2. Replace `D:\Professional\Fibi\fibi40-client\src` with that app’s root.
3. Send the prompt. Attach or `@` this file plus `d:\Personal\polus-vitest` if the agent cannot see the sibling folder.
