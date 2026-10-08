# Work document: Vitest on Angular 14

| | |
|---|---|
| **Document type** | Work / setup record |
| **Project** | `test-vitest-poc` (this repo) |
| **Angular version** | 14.2 |
| **Status** | Vitest-only. Karma/Jasmine removed. Sample tests pass (`npm test`). |
| **Audience** | Developers who will copy this wiring into another Angular 14 app, then keep those tests after an Angular 21 upgrade |
| **Vitest-only setup (remove Karma, then add Vitest)** | [VITEST_ONLY_SETUP.md](./VITEST_ONLY_SETUP.md) |
| **Technical appendix** | [VITEST_POC_DOCUMENTATION.md](./VITEST_POC_DOCUMENTATION.md) (errors, package pins, migration checklists) |
| **Copy-paste setup prompt** | [VITEST_SETUP_PROMPT.md](./VITEST_SETUP_PROMPT.md) |

This file is the readable story. The appendix keeps the raw troubleshooting notes.

---

## Main description

This project exists because we plan to **upgrade Angular to 21**, where **Vitest is the default unit-test runner**.

If we keep writing tests in **Karma + Jasmine** on Angular 14, we will pay twice:

1. Write many Jasmine tests now.
2. After the Angular 21 upgrade, change the runner to Vitest and **rewrite those tests** (different spy API, different helpers, different habits).

So we did the opposite: **write Vitest tests now**, on Angular 14, even though Angular 14 does not support Vitest officially.

Angular 14’s CLI only knows **Karma + Jasmine**. There is no `ng test` Vitest builder on 14. Official Angular Vitest support starts at **Angular 21**. Analog’s nicer Vitest builder needs **Angular 15+**.

That is why this repo adds an **extra wiring layer** — a small set of config and setup files that teach Vitest how to compile Angular 14 components and how to run Angular’s `TestBed` (which expects Zone.js `ProxyZone`).

The important split:

| Lasts after Angular 21 | Temporary (delete after upgrade) |
|------------------------|----------------------------------|
| `*.spec.ts` files written with Vitest (`vi.spyOn`, `expect`, `TestBed`) | `vite.config.ts` |
| `HttpClientTestingModule` / `TestBed` patterns | `src/setup-zone.ts` |
| Same test *ideas* | Old Analog plugin `@analogjs/vite-plugin-angular@0.1.1` |
| | `"test": "vitest run"` instead of `ng test` |

After the app is on Angular 21, we remove the extra wiring and use the official Vitest builder. **We do not rewrite the unit tests.** We only change how they are launched.

This repo is a **proof of concept**. It is not the real product. We left `polus-dynamic-forms` alone. We used a tiny Angular 14 app, added one HTTP demo (JSONPlaceholder posts), wired Vitest, and wrote a few sample specs so we know the wiring works.

**In one sentence:** extra files now, so we can write Vitest tests once and keep them after Angular 21.

---

## What this project contains

```text
This repo
│
├── Application (small demo)
│     AppModule → PostListComponent → PostService → JSONPlaceholder
│
└── Vitest wiring (the real work)
      vite.config.ts          how Vite/Vitest compiles Angular specs
      src/setup-zone.ts       run each test inside Angular ProxyZone
      src/test-setup.ts       start TestBed + reset it after every test
      tsconfig.spec.json      TypeScript knows Vitest globals
      package.json scripts    npm test = vitest run (no Karma)
```

Karma/Jasmine from `ng new` were **removed**. They are not required for Vitest. See [VITEST_ONLY_SETUP.md](./VITEST_ONLY_SETUP.md). `setup-zone.ts` stays — it is for Angular `TestBed`, not for Jasmine.

---

## How the pieces relate (mental model)

A unit test has three layers. We only replaced the first two.

```text
Layer 1 — Assertions     expect(...), vi.spyOn(...)     Vitest  (was Jasmine)
Layer 2 — Runner         find specs, run them, print     Vitest  (was Karma)
Layer 3 — Angular        TestBed, fixtures, fake HTTP    unchanged
```

Karma used to start **Chrome** and wrap every test in **ProxyZone** for us.  
Vitest runs in **Node + jsdom** and knows nothing about Angular. The wiring files fill that gap.

---

## Step-by-step work log

Each step is what we actually did in this POC, and why.

---

### Step 1 — Confirm an Angular 14 app (do not touch the real product)

**What we did**

- Confirmed this workspace is an Angular CLI **14.2.13** app (`@angular/core` ^14.2, TypeScript ~4.7).
- Default tests were Karma + Jasmine (`ng test`).
- Did **not** change `polus-dynamic-forms` (Angular 20). All experiments stay in this POC.

**Why we did**

- The real question is: *can Vitest run on the version we have today (14)?*
- Mixing this experiment into the product app would be risky and harder to roll back.
- We needed a clean, small app so failures came from **Vitest + Angular 14**, not from a large form codebase.

**Note**

- Node 20 prints an “unsupported” warning for Angular 14 CLI. Commands still ran. For CI parity, Node 16/18 is safer. This is a warning, not a blocker.

---

### Step 2 — Add a small HTTP feature so we have something real to test

**What we did**

```bash
npx ng generate service services/post --skip-tests=false
npx ng generate component components/post-list --skip-tests=false
```

- `PostService` calls `https://jsonplaceholder.typicode.com/posts` (list + by id).
- `PostListComponent` loads 5 posts and shows loading / error / list.
- Registered `HttpClientModule` in `AppModule`.

**Why we did**

- A wiring POC with zero app code does not prove `TestBed` + HTTP testing.
- JSONPlaceholder is a public fake API. No backend to maintain.
- HTTP is the pattern we care about later: `HttpClientTestingModule` (no real network in unit tests).
- We generated specs with the CLI, then **rewrote those specs in Vitest style** in Step 7. The feature itself is only a demo.

---

### Step 3 — Install the Vitest toolchain (pinned old versions)

**What we did**

```bash
npm install --save-dev vitest@1.6.1 vite@5.4.11 jsdom@24.1.3 @analogjs/vite-plugin-angular@0.1.1 @vitest/coverage-v8@1.6.1 --legacy-peer-deps
```

Also pinned `@types/node@18` later (see Step 9).

**Why we did**

| Package | Role | Why this version |
|---------|------|------------------|
| `vitest` | Test runner | 1.6.x works with Vite 5 and this Analog plugin |
| `vite` | Bundler Vitest uses | Not used for `ng serve` / `ng build`. App still uses Angular CLI webpack. |
| `jsdom` | Fake browser (`document`, `window`) | Vitest does not open Chrome. Components need a DOM. |
| `@analogjs/vite-plugin-angular@0.1.1` | Compile `@Component` templates for Vite | **Newer Analog needs Angular 17+.** `0.1.1` still accepts Angular 14. |
| `@vitest/coverage-v8` | Coverage reports | Optional; used by `npm run test:coverage` |

**Why we did *not* use `@analogjs/vitest-angular` or `ng test` for Vitest**

- That Analog builder needs Angular DevKit **15+**.
- Angular’s official Vitest builder is **21+**.
- On 14, the only reliable path is: **run `vitest` yourself**, not swap the CLI test builder.

`--legacy-peer-deps` is needed because these packages were not published for Angular 14 as a first-class peer.

---

### Step 4 — Add `vite.config.ts` (tell Vitest how to run Angular specs)

**What we did**

Created `vite.config.ts` with:

- Analog Angular plugin pointed at **`tsconfig.spec.json`**
- `globals: true` — `describe` / `it` / `expect` / `vi` exist without imports
- `environment: 'jsdom'`
- `setupFiles: ['src/test-setup.ts']`
- `pool: 'forks'` and `singleFork: true` — one Node process
- Coverage via v8

**Why we did**

- Vitest will not compile Angular templates by itself. The Analog plugin is that compiler.
- **`tsconfig.app.json` excludes `*.spec.ts`.** If the plugin uses the app tsconfig, Vitest reports **no test suite / 0 tests**. This was a real failure we hit (see problems below).
- `globals: true` matches old Jasmine style and lets `setup-zone.ts` patch the **same** global `it` / `describe`.
- `jsdom` replaces Chrome.
- One fork avoids Zone.js state leaking across parallel workers.

---

### Step 5 — Add `src/setup-zone.ts` (the extra layer Angular 14 actually needs)

**What we did**

Created `src/setup-zone.ts` (adapted from Analog’s setup-zone). It:

1. Loads `zone.js` and `zone.js/dist/zone-testing`.
2. Creates Angular’s **ProxyZone** and a sync zone for `describe`.
3. Replaces global `describe`, `it`, `test`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll`.
4. Runs each callback **inside** those zones (`Zone.run(...)`).
5. Sets `__vitest_zone_patch__` so it does not patch twice.

**Why we did**

This is the core reason the extra layer exists.

Angular 14 `TestBed` expects every test to run inside **ProxyZone**. Karma + Jasmine did that automatically. Vitest does not. Without this file you get:

```text
Expected to be running in 'ProxyZone', but it was not found.
```

The file does **not** invent `it` / `describe`. Vitest already provides those. It only **wraps** them so Angular is happy.

**Why we must not `import { it, describe } from 'vitest'` in specs**

- That import uses the **unpatched** functions.
- The patched ones are the **globals**.
- A direct import brings the ProxyZone error back.

**Is this permanent?**

- No. Delete `setup-zone.ts` when Angular 21’s official Vitest runner is in place. Specs stay.

---

### Step 6 — Add `src/test-setup.ts` (start Angular testing + clean up)

**What we did**

Created `src/test-setup.ts`. It:

1. Imports `./setup-zone` first.
2. Calls `TestBed.initTestEnvironment(...)` once (same idea as old `src/test.ts` for Karma).
3. Registers `afterEach(() => TestBed.resetTestingModule())`.

**Why we did**

- Angular must be told “this process is a test platform” before any spec runs. Karma did that in `src/test.ts`. Vitest never loads that file, so we must do it here.
- After `createComponent()`, TestBed is **instantiated**. The next test’s `configureTestingModule()` then throws:

```text
Cannot configure the test module when the test module has already been instantiated
```

- A global reset after every test is the fix. Karma often hid this; Vitest does not.

**Later follow-up:** we deleted `src/test.ts` and `karma.conf.js` when we dropped Karma entirely (Step 12). `test-setup.ts` is the only TestBed bootstrap now.

---

### Step 7 — Point TypeScript at Vitest globals (`tsconfig.spec.json`)

**What we did**

Updated `tsconfig.spec.json`:

- `"types": ["vitest/globals", "node"]` (no longer `"jasmine"` for the Vitest path)
- `"files": ["src/test-setup.ts"]`
- `"include": ["src/**/*.spec.ts", "src/**/*.d.ts"]`

Some spec files also have `/// <reference types="vitest/globals" />` so the IDE stops saying `Cannot find name 'it'`.

**Why we did**

Two different problems:

| Problem | Layer | Fix |
|---------|--------|-----|
| Editor: `Cannot find name 'it'` | Types only | `vitest/globals` in tsconfig (and optional triple-slash) |
| Runtime: `it is not defined` | Vitest | `globals: true` in `vite.config.ts` |
| Runtime: ProxyZone missing | Angular | `setup-zone.ts` |

The triple-slash comment does **nothing** when tests run. It only helps TypeScript/the IDE.

We did **not** install `@types/jest`. That is the wrong type package.

---

### Step 8 — Change npm scripts (Vitest is the only runner)

**What we did**

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

At first we also kept `"test:karma": "ng test"`. That fallback was optional and was **removed in Step 12**.

**Why we did**

- `npm test` is what CI and people run first. It must be Vitest.
- `vitest run` = one shot (CI). `vitest` = watch mode (local).
- Angular 14 cannot point `ng test` at Vitest, so we run the `vitest` CLI directly.

---

### Step 9 — Fix production build after Vitest install (`@types/node` + `skipLibCheck`)

**What we did**

- Pinned `@types/node@18` (example: `^18.19.68`).
- Set `"skipLibCheck": true` in root `tsconfig.json`.

**Why we did**

- Installing Vitest/jsdom pulled a **new** `@types/node`.
- TypeScript **4.7** cannot parse modern Node types (`Disposable`, `Symbol.dispose`, …).
- `ng build` then failed with hundreds of errors unrelated to our app code.
- Pinning Node 18 types + skipLibCheck restores a working Angular 14 build.

This step is easy to miss. Wiring Vitest must not break the product build.

---

### Step 10 — Write sample unit tests in Vitest style (this POC only)

**What we did**

| File | Tests | What they prove |
|------|-------|-----------------|
| `post.service.spec.ts` | 4 | Fake HTTP: limit, get by id, 404 |
| `post-list.component.spec.ts` | 4 | Mock service, error message, DOM titles |
| `app.component.spec.ts` | 2 | Shell creates; title is correct |

Patterns used:

- `HttpTestingController` — never call the real API in unit tests
- `vi.spyOn(...)` — not Jasmine `spyOn`
- `expect.unreachable(...)` — not Jasmine `fail()`
- Global `describe` / `it` / `expect` — no import from `'vitest'`
- `NO_ERRORS_SCHEMA` on `AppComponent` so `<app-post-list>` is ignored

**Why we did**

- Wiring that is never executed is not proven.
- These specs are **examples** for the real app later, not product coverage.
- We used Vitest APIs on purpose so we will **not** rewrite spies after Angular 21.
- We avoided `fakeAsync` / `tick` because they are fragile on Vitest now and still discouraged later.

When you copy wiring into another app, **you can skip this step** and leave existing Jasmine specs untouched until you migrate them.

---

### Step 11 — Run and confirm

**What we did**

```bash
npm test                 # 10 tests passed
npm run test:coverage
npm run build            # production build still works
```

**Why we did**

- Green Vitest is not enough if `ng build` is broken (Step 9).
- Coverage proves the coverage plugin is wired.
- That is the acceptance bar for this POC.

---

### Step 12 — Fully remove Karma / Jasmine leftovers from `ng new`

**What we did**

- Uninstalled `karma`, `karma-chrome-launcher`, `karma-coverage`, `karma-jasmine`, `karma-jasmine-html-reporter`, `jasmine-core`, `@types/jasmine`.
- Deleted `karma.conf.js` and `src/test.ts`.
- Removed `architect.test` from `angular.json` (the Karma builder).
- Removed `test:karma` from `package.json`.
- Cleaned VS Code launch/task entries that pointed at Karma (`localhost:9876`).
- **Kept** `src/setup-zone.ts`, `src/test-setup.ts`, `vite.config.ts`, and `zone.js`.

**Why we did**

- `ng new` always generates Karma. Keeping it after Vitest works is only a safety net, not a requirement.
- Unused Karma packages do not help Vitest. They confuse the setup (“is Jasmine still involved?”).
- `setup-zone.ts` is **not** a Jasmine file. It replaces the ProxyZone wrapping that Karma’s adapter used to do. Removing Karma makes that file *more* necessary, not less.

Full file list: [VITEST_ONLY_SETUP.md](./VITEST_ONLY_SETUP.md).

---

## Problems we hit (and which step fixed them)

These appeared while doing the steps above. They are the reason some files look “over-engineered.”

| # | What went wrong | Why | What we added |
|---|-----------------|-----|----------------|
| 1 | No official Vitest on Angular 14 | CLI/Analog builders need 15 or 21 | Manual `vitest` + Analog **0.1.1** (Steps 3–4) |
| 2 | `No test suite found` | Plugin used `tsconfig.app.json` (excludes specs) | `angular({ tsconfig: './tsconfig.spec.json' })` (Step 4) |
| 3 | `Expected to be running in 'ProxyZone'` | Vitest does not wrap tests in Zone | `src/setup-zone.ts` (Step 5) |
| 4 | TestBed already instantiated | Next test configures without reset | `TestBed.resetTestingModule()` in `test-setup.ts` (Step 6) |
| 5 | `'vitest' has already been patched with 'Zone'` | Setup file ran twice | `__vitest_zone_patch__` guard (Step 5) |
| 6 | `ng build` dies on `@types/node` | TS 4.7 vs new Node types | Pin `@types/node@18` + `skipLibCheck` (Step 9) |
| 7 | Node 20 “unsupported” warning | Angular 14 CLI age | Ignore locally; prefer Node 16/18 in CI (Step 1) |

---

## After Angular 21 — what we throw away vs what we keep

The plan: write Vitest tests on 14 now → upgrade the **application** to 21 later (~6 months) → change **only the runner**.

**Keep (almost no rewrite)**

- `describe` / `it` / `expect`
- `vi.spyOn`, `vi.fn`
- `TestBed`, `HttpClientTestingModule`, `fixture.detectChanges()`
- The spec files in this POC

**Delete or replace (about 1–2 days of config, not a rewrite of every test)**

| Angular 14 (now) | Angular 21 (later) |
|------------------|--------------------|
| Manual `vite.config.ts` | `@angular/build:unit-test` via `ng test` |
| `src/setup-zone.ts` | CLI handles Zone / setup |
| Analog `0.1.1` | Not needed |
| `"test": "vitest run"` | `"test": "ng test --no-watch"` |

**Effort if tests stay clean (no `fakeAsync`, no Jasmine leftovers)**

- Tens of service tests: about **half a day to one day** (swap config, run suite).
- Heavy `fakeAsync` / `tick`: **days**, because those tests must be rewritten.

**Checklist at upgrade time** (tests only): Angular 21 app builds → official Vitest packages → switch `angular.json` builder → delete `vite.config.ts` and `setup-zone.ts` → update `test-setup.ts` → run `ng test --no-watch` → update CI.

---

## Rules for anyone writing tests on this wiring

**Do**

- Use global `describe`, `it`, `expect`, `vi`
- Fake HTTP with `HttpClientTestingModule`
- Prefer `async` / `await` or `vi.useFakeTimers()`

**Do not**

- `import { it, describe } from 'vitest'`
- Use `jasmine.createSpy`, global `spyOn`, or `fail()`
- Use `fakeAsync` / `tick` in new tests
- Put `setup-zone` logic inside a spec
- Hit real APIs in unit tests

---

## Commands

```bash
npm start              # Angular 14 app — http://localhost:4200
npm test               # Vitest, one run
npm run test:watch     # Vitest, re-run on change
npm run test:coverage  # Coverage
npm run build          # Production build (must stay green)
```

---

## Verdict

| Question | Answer |
|----------|--------|
| Can Vitest run on Angular 14? | **Yes**, with this extra wiring. |
| Is it one CLI command? | **No.** Manual packages + three setup files. |
| Should we write Jasmine tests until Angular 21? | **No**, if we want to avoid a rewrite. |
| Do we rewrite tests at Angular 21? | **No**, if we write Vitest-style specs now and avoid `fakeAsync`. |
| What is temporary? | `vite.config.ts`, `setup-zone.ts`, Analog 0.1.1, direct `vitest` CLI. |

---

*Work document for the Angular 14 Vitest POC. Detail and error tables: [VITEST_POC_DOCUMENTATION.md](./VITEST_POC_DOCUMENTATION.md).*
