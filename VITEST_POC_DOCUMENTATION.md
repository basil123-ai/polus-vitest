# Vitest + Angular 14 POC Documentation

This document records every step taken to evaluate **Vitest unit testing on Angular 14**, including difficulties encountered and how they were resolved.

**Project:** `Test-vitset` (Angular 14.2 POC)  
**Reference project (unchanged):** `polus-dynamic-forms` (Angular 20)

---

## 1. Goal

- Keep `polus-dynamic-forms` untouched
- Create a separate Angular **14** POC in `Test-vitset`
- Add an HTTP call to a public test API
- Replace Karma/Jasmine with **Vitest**
- Document feasibility, friction points, and recommended patterns

---

## 2. Reference review: `polus-dynamic-forms`

| Item | Finding |
|------|---------|
| Angular version | **20** (standalone components, signals, `@angular/build`) |
| Default testing | Karma + Jasmine (`ng test`) |
| HTTP usage | Not used in core form logic (localStorage + services) |
| Relevant patterns | `TestBed`, services, reactive forms, `OnPush` |

**Decision:** Do not modify `polus-dynamic-forms`. Angular 14 POC lives entirely in `Test-vitset`.

---

## 3. Step-by-step actions

### Step 1 — Verify / create Angular 14 workspace

**Action:** Confirmed `Test-vitset` already contained an Angular CLI 14 app (`test-vitest-poc`).

```text
Angular CLI: 14.2.13
@angular/core: ^14.2.0
TypeScript: ~4.7.2
Default test runner: Karma + Jasmine
```

**Note:** Node 20 shows as “unsupported” for Angular 14 CLI, but commands still ran.

---

### Step 2 — Generate feature code (HTTP POC)

**Action:** Generated service + component:

```bash
npx ng generate service services/post --skip-tests=false
npx ng generate component components/post-list --skip-tests=false
```

**Implemented:**

- `PostService` → calls [JSONPlaceholder](https://jsonplaceholder.typicode.com/posts)
- `PostListComponent` → loads and displays posts
- `HttpClientModule` registered in `AppModule`

**Public API used:**

- `GET https://jsonplaceholder.typicode.com/posts`
- `GET https://jsonplaceholder.typicode.com/posts/:id`

---

### Step 3 — Install Vitest toolchain

**Action:** Installed dev dependencies:

```bash
npm install --save-dev vitest@1.6.1 vite@5.4.11 jsdom@24.1.3 @analogjs/vite-plugin-angular@0.1.1 @vitest/coverage-v8@1.6.1 --legacy-peer-deps
```

**Why `@analogjs/vite-plugin-angular@0.1.1`?**

- Latest Analog packages require **Angular 17+**
- Version **0.1.1** is one of the last builds with peer support for `@angular-devkit/build-angular ^14.0.0`

**Why not `@analogjs/vitest-angular` CLI builder?**

- `@analogjs/vitest-angular` requires Angular DevKit **15+**
- Angular 14 must run Vitest **directly** via `vitest` CLI (not `ng test` builder swap)

---

### Step 4 — Add Vitest config

**Files created:**

| File | Purpose |
|------|---------|
| `vite.config.ts` | Vitest + Angular Vite plugin |
| `src/setup-zone.ts` | ProxyZone patch for Vitest globals |
| `src/test-setup.ts` | TestBed init + reset between tests |

**Key config (`vite.config.ts`):**

```typescript
plugins: [angular({ tsconfig: './tsconfig.spec.json' })],
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: ['src/test-setup.ts'],
  pool: 'forks',
  poolOptions: { forks: { singleFork: true } },
}
```

**Important:** Angular plugin must use `tsconfig.spec.json`, not `tsconfig.app.json`, or spec files compile to “0 tests found”.

---

### Step 5 — Update TypeScript test config

**Updated `tsconfig.spec.json`:**

```json
{
  "compilerOptions": {
    "types": ["vitest/globals", "node"]
  },
  "files": ["src/test-setup.ts"],
  "include": ["src/**/*.spec.ts", "src/**/*.d.ts"]
}
```

Removed legacy Karma entries (`src/test.ts`, `jasmine` types).

---

### Step 6 — Update npm scripts

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage",
"test:karma": "ng test"
```

Karma remains available as fallback via `npm run test:karma`.

---

### Step 7 — Write unit tests

| Spec file | Tests | Focus |
|-----------|-------|-------|
| `post.service.spec.ts` | 4 | `HttpClientTestingModule`, flush, error path |
| `post-list.component.spec.ts` | 4 | mocked service, template rendering, error UI |
| `app.component.spec.ts` | 2 | basic component creation |

**Testing patterns used:**

- `HttpTestingController` for HTTP (no real network in unit tests)
- `vi.spyOn(...)` for service mocking in component tests
- Vitest globals (`describe`, `it`, `expect`, `vi`) — **do not** import `it`/`describe` from `vitest` when using Zone patch
- `NO_ERRORS_SCHEMA` in `AppComponent` test to ignore child component template

---

### Step 8 — Run and validate

```bash
npm test           # 10/10 passed
npm run test:coverage
npm run build
```

**Final result:** All tests green, app builds successfully.

---

## 4. Difficulties encountered (detailed)

### Difficulty 1 — No first-class Vitest support in Angular 14

| Aspect | Detail |
|--------|--------|
| **Problem** | Angular’s native `@angular/build:unit-test` Vitest builder is **Angular 21+** only |
| **Problem** | Analog `@analogjs/vitest-angular` builder requires **Angular 15+** |
| **Impact** | Cannot use `ng g @analogjs/platform:setup-vitest` out of the box |
| **Workaround** | Manual Vitest + older `@analogjs/vite-plugin-angular@0.1.1` + direct `vitest` CLI |

**Ease rating:** Medium — doable, but not “one schematic and done”.

---

### Difficulty 2 — Spec files not detected (`No test suite found`)

| Aspect | Detail |
|--------|--------|
| **Symptom** | Vitest reported `No test suite found in file ...spec.ts` |
| **Root cause** | `@analogjs/vite-plugin-angular` defaulted to `tsconfig.app.json`, which excludes `*.spec.ts` |
| **Fix** | `angular({ tsconfig: './tsconfig.spec.json' })` in `vite.config.ts` |

---

### Difficulty 3 — `ProxyZone` error

| Aspect | Detail |
|--------|--------|
| **Symptom** | `Expected to be running in 'ProxyZone', but it was not found` |
| **Root cause** | Vitest does not wrap tests in Zone.js ProxyZone (Karma/Jasmine did this automatically) |
| **Fix** | Added `src/setup-zone.ts` (adapted from Analog’s `setup-zone`) to patch global `describe`/`it`/`beforeEach` |

This is the **biggest Angular 14 + Vitest friction point**.

---

### Difficulty 4 — `TestBed` “already instantiated”

| Aspect | Detail |
|--------|--------|
| **Symptom** | `Cannot configure the test module when the test module has already been instantiated` |
| **Root cause** | Component tests call `createComponent()`; next test’s `beforeEach` tries `configureTestingModule()` without reset |
| **Fix** | Global `afterEach(() => TestBed.resetTestingModule())` in `src/test-setup.ts` |

---

### Difficulty 5 — Zone patch loaded twice

| Aspect | Detail |
|--------|--------|
| **Symptom** | `'vitest' has already been patched with 'Zone'` |
| **Root cause** | Setup file evaluated more than once in Vitest graph |
| **Fix** | Guard with `__vitest_zone_patch__` flag (skip re-patch instead of throwing) |

---

### Difficulty 6 — `@types/node` vs TypeScript 4.7 build break

| Aspect | Detail |
|--------|--------|
| **Symptom** | `ng build` failed with hundreds of `@types/node` errors (`Disposable`, `Symbol.dispose`, etc.) |
| **Root cause** | Vitest/jsdom pulled modern `@types/node` incompatible with TS 4.7 |
| **Fix** | Pin `@types/node@18` + add `"skipLibCheck": true` in root `tsconfig.json` |

---

### Difficulty 7 — Node 20 + Angular 14 mismatch

| Aspect | Detail |
|--------|--------|
| **Symptom** | CLI warns Node 20 is unsupported for Angular 14 |
| **Impact** | Warning only in this POC; CI should use Node 16/18 for Angular 14 parity |

---

## 5. How easy is Vitest on Angular 14?

| Area | Rating | Notes |
|------|--------|-------|
| Service + HTTP tests | **Easy** | Same `TestBed` + `HttpClientTestingModule` patterns as Karma |
| Component tests | **Medium** | Needs Zone patch + `TestBed.resetTestingModule()` |
| `fakeAsync` / `tick` | **Hard** | Not supported reliably; prefer `async/await` or `vi.useFakeTimers()` |
| CLI integration | **Hard** | No official `ng test` Vitest builder on Angular 14 |
| Speed vs Karma | **Easy win** | Tests complete in ~10s vs launching real browser |
| Migration from Jasmine | **Medium** | Replace `fail()` → `expect.unreachable()`, `spyOn` → `vi.spyOn` |

---

## 6. Recommended test patterns (Angular 14 + Vitest)

### HTTP service test

```typescript
beforeEach(() => {
  TestBed.configureTestingModule({
    imports: [HttpClientTestingModule],
    providers: [PostService],
  });
  service = TestBed.inject(PostService);
  httpMock = TestBed.inject(HttpTestingController);
});

afterEach(() => httpMock.verify());
```

### Component test with mocked HTTP service

```typescript
vi.spyOn(postService, 'getPosts').mockReturnValue(of(mockPosts));
component.loadPosts();
expect(component.posts).toEqual(mockPosts);
```

### Do

- Use Vitest **globals** (`describe`, `it`, `vi`) when Zone patch is enabled
- Reset TestBed after each test
- Mock HTTP with `HttpTestingController` (unit tests should not hit real APIs)

### Avoid

- Importing `{ it, describe } from 'vitest'` (breaks Zone wrapping)
- Calling real `jsonplaceholder.typicode.com` in unit tests (flaky, slow, needs network)
- Expecting `ng test` to run Vitest without custom setup on Angular 14

---

## 7. Project structure (Test-vitset)

```text
Test-vitset/
├── vite.config.ts              # Vitest + Angular plugin
├── src/
│   ├── setup-zone.ts           # ProxyZone patch (critical for Angular 14)
│   ├── test-setup.ts           # TestBed init + reset
│   └── app/
│       ├── models/post.model.ts
│       ├── services/post.service.ts
│       ├── services/post.service.spec.ts
│       └── components/post-list/
│           ├── post-list.component.ts
│           └── post-list.component.spec.ts
└── VITEST_POC_DOCUMENTATION.md
```

---

## 8. Commands cheat sheet

```bash
cd Test-vitset

npm start              # Dev server
npm test               # Vitest (CI mode)
npm run test:watch     # Vitest watch mode
npm run test:coverage  # Coverage report
npm run test:karma     # Legacy Karma runner
npm run build          # Production build
```

---

## 9. Verdict for your POC question

**Can you implement Vitest unit testing on Angular 14?**  
**Yes**, but with manual setup. It is **not** as simple as Angular 21+ where Vitest is the default.

**Is it worth it on Angular 14?**

- **Yes** if you want faster feedback, modern `vi` API, and are willing to maintain `setup-zone.ts` + `vite.config.ts`
- **Consider waiting / upgrading** if you want official CLI support, schematics, and less Zone.js glue code

**For `polus-dynamic-forms` (Angular 20):** Vitest migration would be **significantly easier** using Analog or future native Angular Vitest builders — but that was intentionally out of scope for this POC.

---

## 10. After Angular 21 upgrade: Vitest migration guide

This section covers the planned path: **implement Vitest on Angular 14 now, write tests from scratch, upgrade the application to Angular 21 in ~6 months**, and assess what changes on the **testing side only**. The Angular application upgrade is handled separately.

### 10.1 Short answer

**Vitest test migration at Angular 21: generally easy to moderate — not a big rewrite.**

You are **not** migrating Karma/Jasmine → Vitest twice. You migrate **custom Angular 14 Vitest glue → official Angular 21 Vitest setup** once. The spec files themselves mostly survive.

| Question | Answer |
|----------|--------|
| Big effort to migrate Vitest tests at Angular 21? | **No** — if you avoid `fakeAsync` and Jasmine habits |
| What actually changes? | **Runner config + setup files**, not test logic |
| Biggest risk? | **`fakeAsync` / `tick` tests** and Zone/zoneless component quirks |
| Is Vitest-on-14-now a sound plan? | **Yes** — portable tests; only Angular 14 plumbing is temporary |

---

### 10.2 What travels with you (minimal change)

These patterns stay almost the same on Angular 21:

| Pattern | Still works on Angular 21 |
|---------|---------------------------|
| `describe` / `it` / `expect` | Yes |
| `vi.spyOn()`, `vi.fn()`, `mockReturnValue()` | Yes |
| `HttpClientTestingModule` + `HttpTestingController` | Yes |
| `TestBed.configureTestingModule()` | Yes |
| `fixture.detectChanges()` | Yes |
| Service unit tests | Yes — easiest |
| Component tests with mocked dependencies | Yes |

**Example from this POC:** `post.service.spec.ts` and `post-list.component.spec.ts` would need little or no logic change — mostly config/import cleanup.

---

### 10.3 What you replace (one-time, ~1–2 days)

This is Angular 14 POC-specific infrastructure you **remove** when moving to Angular 21:

| Angular 14 (now) | Angular 21 (later) |
|------------------|-------------------|
| Manual `vite.config.ts` | CLI `@angular/build:unit-test` |
| Custom `src/setup-zone.ts` | Built-in / simpler Zone handling |
| `@analogjs/vite-plugin-angular@0.1.1` | Not needed (or newer Analog if desired) |
| `vitest run` in npm scripts | `ng test` works natively |
| Manual `TestBed.resetTestingModule()` in setup | Often handled better by CLI |
| `tsconfig.spec.json` workarounds | Standard Angular 21 test config |

**Typical upgrade steps (tests only):**

```bash
# After Angular 21 app upgrade is complete:
npm install vitest jsdom @vitest/coverage-v8 --save-dev

# Update angular.json test builder to @angular/build:unit-test
# Remove: vite.config.ts, src/setup-zone.ts (Angular 14 glue)
# Update: src/test-setup.ts → align with Angular 21 defaults
# Optional: ng generate @schematics/angular:refactor-jasmine-vitest

ng test --no-watch   # Verify all specs pass
```

That is **infrastructure migration**, not rewriting every spec file.

---

### 10.4 Possible challenges at Angular 21 (test-side only)

#### Challenge 1 — Test runner config swap — **Easy**

Rewire `angular.json`, delete old Vitest/Analog 14 config, run the Angular 21 Vitest schematic. Individual test bodies mostly unchanged.

#### Challenge 2 — `fakeAsync` / `tick` — **Medium (avoid now)**

Angular 14 Vitest requires a Zone patch for `fakeAsync`. On Angular 21, support is still limited; **`fakeAsync` is discouraged with Vitest**.

| Prefer (now and later) | Avoid |
|------------------------|-------|
| `async/await` + `fixture.whenStable()` | `fakeAsync(() => { ... tick(100); })` |
| `vi.useFakeTimers()` for timers | `tick()` / `flush()` |
| `firstValueFrom()` / `lastValueFrom()` for observables | Zone-dependent async helpers |

Avoid `fakeAsync` from day one → much smoother migration.

#### Challenge 3 — Zone.js vs zoneless (Angular 21 default) — **Medium**

New Angular 21 projects may use zoneless change detection. Your Angular 14 app uses Zone.js.

When you upgrade the app:

- Existing Zone-based tests usually still work initially
- If the app moves to zoneless, some component tests may need updates (`detectChanges`, signal-based patterns)

This is an **Angular change-detection shift**, not a Vitest limitation.

#### Challenge 4 — `TestBed` module shape — **Low**

If the app migrates from `NgModule` to standalone components, test setup changes mechanically:

```typescript
// Angular 14 (NgModule style)
TestBed.configureTestingModule({
  declarations: [MyComponent],
  imports: [HttpClientTestingModule],
});

// Angular 21 (standalone style)
TestBed.configureTestingModule({
  imports: [MyComponent, HttpClientTestingModule],
});
```

Same test logic; different `configureTestingModule` shape.

#### Challenge 5 — Jasmine habits — **Low if disciplined**

| Avoid (Jasmine) | Use (Vitest) |
|-----------------|--------------|
| `jasmine.createSpy()` | `vi.fn()` |
| `fail('message')` | `expect.unreachable()` |
| Global `spyOn()` | `vi.spyOn()` |
| `import { it } from 'vitest'` | Vitest globals (`describe`, `it`, `vi`) |

Stick to Vitest APIs now → no syntax migration later.

#### Challenge 6 — Snapshots & coverage — **Low**

- `toMatchSnapshot()` works in both; may need snapshot path/config update
- CI: change `vitest run` → `ng test --no-watch` — pipeline change, not test rewrites

---

### 10.5 Effort estimate (tests only, at Angular 21 upgrade)

| Scenario | Estimated effort |
|----------|------------------|
| ~20–50 service/HTTP tests, no `fakeAsync` | **0.5–1 day** (config swap + smoke run) |
| ~50–100 tests, some component tests | **1–2 days** |
| Heavy `fakeAsync` / `tick` usage | **3–5+ days** (rewrite those tests) |
| Mixed Jasmine syntax in specs | **+1 day** cleanup |

If tests are written cleanly from now (see checklist below), expect the **easy end** of this range.

---

### 10.6 Writing tests now for painless migration later

**Do:**

1. Use **Vitest globals** — do not import `describe` / `it` from `'vitest'` (required on Angular 14 with Zone patch anyway)
2. Mock HTTP with **`HttpClientTestingModule`** — never hit real APIs in unit tests
3. Avoid **`fakeAsync` / `tick`** — use async patterns or `vi.useFakeTimers()`
4. Keep specs **focused** — service tests separate from component tests
5. Use **`vi.spyOn`** consistently, not Jasmine spies
6. Add **`afterEach` cleanup** where needed (mocks, timers: `vi.restoreAllMocks()`, `vi.useRealTimers()`)

**Don't:**

1. Import test functions from `'vitest'` when Zone patch is enabled
2. Use Karma/Jasmine-only APIs (`fail`, `jasmine.createSpy`, global `spyOn`)
3. Rely on `fakeAsync` / `tick` / `flush` for new tests
4. Couple tests to Angular 14-only setup files (`setup-zone.ts` logic in specs)

---

### 10.7 Migration checklist (use at Angular 21 upgrade time)

- [ ] Angular 21 application upgrade complete and app builds
- [ ] Install Vitest packages per Angular 21 docs (`vitest`, `jsdom`)
- [ ] Switch `angular.json` test builder to `@angular/build:unit-test`
- [ ] Remove Angular 14 glue: `vite.config.ts`, `src/setup-zone.ts`
- [ ] Update `src/test-setup.ts` to Angular 21 template
- [ ] Update `tsconfig.spec.json` types to `["vitest/globals"]`
- [ ] Update npm scripts: `"test": "ng test --no-watch"`
- [ ] Run full suite: `ng test --no-watch`
- [ ] Update CI pipeline test command
- [ ] Spot-check component tests if app moved to standalone or zoneless
- [ ] Search codebase for `fakeAsync`, `tick`, `jasmine.`, `fail(` and refactor if found

---

### 10.8 Why `setup-zone.ts` exists on Angular 14

This section explains **why Angular 14 + Vitest needs `src/setup-zone.ts`**, even though Vitest already provides `describe`, `it`, and `beforeEach`.

#### 10.8.1 The core reason

The issue is **not** that test functions are missing.  
The issue is that Angular 14 test internals expect each test to run inside a Zone.js testing context called **`ProxyZone`**.

- Karma/Jasmine setup historically patched test execution into this zone automatically.
- Vitest is framework-agnostic; it does not provide Angular-specific zone patching by default.

Without ProxyZone wrapping, Angular test cleanup/hooks can fail with:

```text
Expected to be running in 'ProxyZone', but it was not found.
```

#### 10.8.2 What `ProxyZone` is

`ProxyZone` is a Zone.js test wrapper that:

1. Tracks async work triggered during a test
2. Lets Angular testing helpers switch/reset zone behavior safely
3. Helps isolate each spec and avoid state leaks between tests

Angular test runtime and helpers such as `fakeAsync`-related paths are built around this concept in Angular 14-era testing.

#### 10.8.3 What `setup-zone.ts` does in this POC

`src/setup-zone.ts`:

1. Loads `zone.js` + `zone.js/dist/zone-testing`
2. Creates `SyncTestZoneSpec` and `ProxyZoneSpec`
3. Patches Vitest globals (`describe`, `it`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll`)
4. Wraps each callback so the test body executes inside `ProxyZone`
5. Guards against duplicate patching when setup files are evaluated more than once

This makes Angular `TestBed` behavior stable under Vitest in Angular 14.

#### 10.8.4 Why importing from `vitest` can break this

When Zone patching is enabled, prefer Vitest **globals**:

```typescript
// preferred
it('works', () => { ... });
```

Avoid importing test functions directly:

```typescript
// avoid in Angular 14 + setup-zone patch scenario
import { it } from 'vitest';
```

Direct imports can bypass patched globals and reintroduce ProxyZone errors.

#### 10.8.5 Is this permanent?

No. This is mostly an Angular 14 compatibility workaround.

At Angular 21 migration time (with native CLI Vitest support), you should usually:

- remove Angular 14 glue (`vite.config.ts` custom pathing + `src/setup-zone.ts`)
- move to Angular’s official Vitest runner setup
- keep most spec files unchanged

---

### 10.9 Types vs runtime setup (Vitest globals explained)

Vitest testing in this POC uses **two separate layers**. They solve different problems and should not be confused.

#### 10.9.1 Two layers at a glance

| Piece | Purpose | Layer | Required for tests to… |
|-------|---------|-------|------------------------|
| `/// <reference types="vitest/globals" />` | Tells TypeScript/IDE that `describe`, `it`, `expect`, `vi` exist | **Types only** | Compile without errors; remove red squiggles in the editor |
| `"types": ["vitest/globals"]` in `tsconfig.spec.json` | Same as above, project-wide for spec files | **Types only** | Same |
| `test.globals: true` in `vite.config.ts` | Vitest injects test functions at runtime | **Runtime** | Actually run `it()` / `describe()` without imports |
| `import './setup-zone'` in `test-setup.ts` | Wraps Vitest globals in `ProxyZone` for Angular | **Runtime** | Pass Angular `TestBed` cleanup on Angular 14 |

**Key point:** `reference types="vitest/globals"` has **no relationship** to `setup-zone` at runtime. One fixes IDE/types; the other fixes Angular Zone behavior.

#### 10.9.2 Where do `it`, `describe`, `expect` come from?

You are **not** importing them from `'vitest'` in spec files. They come from **Vitest global mode**:

```typescript
// vite.config.ts
test: {
  globals: true,  // ← Vitest provides describe/it/expect/vi as globals at runtime
}
```

In spec files you write:

```typescript
describe('PostService', () => {
  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
```

No import line is needed at runtime — same idea as old Jasmine/Karma globals.

**TypeScript still needs to know those names exist.** That is what `vitest/globals` types provide (via `tsconfig.spec.json` and/or the triple-slash reference).

#### 10.9.3 Mental model

```text
Your spec file (*.spec.ts)
│
├─ TYPE LAYER (compile-time / IDE)
│    ├─ tsconfig.spec.json → "types": ["vitest/globals"]
│    └─ /// <reference types="vitest/globals" />  (per-file fallback for IDE)
│         → Fixes: "Cannot find name 'it'"
│
└─ RUNTIME LAYER (when npm test runs)
     ├─ Vitest globals: true  → injects it/describe/expect
     ├─ setup-zone.ts        → wraps them in ProxyZone (Angular 14 only)
     └─ test-setup.ts        → TestBed.initTestEnvironment + reset
          → Fixes: "Expected to be running in 'ProxyZone'"
```

#### 10.9.4 Why Karma/Jasmine specs did not show this error

Old Angular 14 Karma setup used:

```json
// tsconfig.spec.json (Karma era)
"types": ["jasmine"]
```

And `@types/jasmine` defined global `describe`, `it`, `expect`. Karma bootstrapped Jasmine automatically, so:

- **Runtime:** Jasmine globals existed (like Vitest `globals: true` today)
- **Types:** `@types/jasmine` in `tsconfig.spec.json` — no triple-slash needed

With Vitest, the equivalent type package path is **`vitest/globals`**, not `@types/jasmine` or `@types/jest`.

We added `/// <reference types="vitest/globals" />` in spec/setup files because the IDE sometimes did not associate `*.spec.ts` with `tsconfig.spec.json` (common in multi-root workspaces). Tests still passed via CLI; only the editor showed errors.

#### 10.9.5 Is this the same on Angular 21?

**Same concept, less manual glue.**

| Aspect | Angular 14 (this POC) | Angular 21 (future) |
|--------|----------------------|---------------------|
| Use globals (`describe`, `it`, `expect`) | Yes | Yes |
| `vitest/globals` in `tsconfig.spec.json` | Yes | Yes |
| Import from `'vitest'` in specs | Avoid (breaks Zone patch) | Usually avoid when using globals |
| `setup-zone.ts` | **Required manually** | Usually **not needed** (CLI handles setup) |
| `/// <reference types="vitest/globals" />` | Optional IDE fallback | Often unnecessary if TS project is wired correctly |

You still typically **do not import** test functions in Angular 21 when using global mode — the CLI configures Vitest the same way conceptually.

#### 10.9.6 Do / don't for your team

**Do:**

- Use global `describe` / `it` / `expect` / `vi` in spec files
- Keep `"types": ["vitest/globals"]` in `tsconfig.spec.json`
- Add `/// <reference types="vitest/globals" />` at the top of spec files if the IDE shows `Cannot find name 'it'`

**Don't:**

- Install `@types/jest` or `@types/mocha` for Vitest — wrong type definitions
- `import { it, describe } from 'vitest'` when `setup-zone` is enabled — bypasses ProxyZone patch
- Assume `reference types` replaces `setup-zone` — they are unrelated

---

## 11. References

- [Analog Vitest setup](https://analogjs.org/docs/features/testing/vitest) (Angular 17+)
- [Angular Karma → Vitest migration](https://angular.dev/guide/testing/migrating-to-vitest) (Angular 21+)
- [JSONPlaceholder API](https://jsonplaceholder.typicode.com/)
- [ProxyZone + Vitest explanation](https://andreramos.dev/angular/angular-vitest-fakeasync-proxyzone-error/)

---

*Generated as part of the Angular 14 Vitest POC — all steps executed in `Test-vitset` without modifying `polus-dynamic-forms`.*
