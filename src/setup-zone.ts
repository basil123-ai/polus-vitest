import 'zone.js/dist/zone';
import 'zone.js/dist/zone-testing';

/**
 * Patch Vitest globals so Angular TestBed runs inside ProxyZone.
 * Adapted from @analogjs/vitest-angular/setup-zone (required for Angular 14 + Vitest).
 */
const Zone = (globalThis as { Zone?: typeof import('zone.js/dist/zone').Zone }).Zone;

if (Zone === undefined) {
  throw new Error('Missing: Zone (zone.js)');
}

if ((globalThis as { __vitest_zone_patch__?: boolean }).__vitest_zone_patch__ === true) {
  // Vitest can evaluate setup files more than once in watch/build graphs.
} else {
  (globalThis as { __vitest_zone_patch__?: boolean }).__vitest_zone_patch__ = true;

const SyncTestZoneSpec = Zone['SyncTestZoneSpec'];
const ProxyZoneSpec = Zone['ProxyZoneSpec'];

if (SyncTestZoneSpec === undefined) {
  throw new Error('Missing: SyncTestZoneSpec (zone.js/dist/zone-testing)');
}
if (ProxyZoneSpec === undefined) {
  throw new Error('Missing: ProxyZoneSpec (zone.js/dist/zone-testing)');
}

const env = globalThis as Record<string, unknown>;
const ambientZone = Zone.current;

const syncZone = ambientZone.fork(new SyncTestZoneSpec('vitest.describe'));

function wrapDescribeInZone(describeBody: (...args: unknown[]) => unknown) {
  return function (...args: unknown[]) {
    return syncZone.run(describeBody, null, args);
  };
}

const testProxyZone = ambientZone.fork(new ProxyZoneSpec());

function wrapTestInZone(testBody: ((...args: unknown[]) => unknown) | undefined) {
  if (testBody === undefined) {
    return undefined;
  }

  const wrappedFunc = function (...args: unknown[]) {
    return testProxyZone.run(testBody, null, args);
  };

  try {
    Object.defineProperty(wrappedFunc, 'length', {
      configurable: true,
      writable: true,
      enumerable: false,
    });
    wrappedFunc.length = testBody.length;
  } catch {
    return testBody.length === 0
      ? () => testProxyZone.run(testBody, null)
      : (done: unknown) => testProxyZone.run(testBody, null, [done]);
  }

  return wrappedFunc;
}

const bindDescribe = (originalVitestFn: any, eachFn: any) =>
  function (...eachArgs: unknown[]) {
    return function (...args: unknown[]) {
      args[1] = wrapDescribeInZone(args[1] as (...args: unknown[]) => unknown);
      return eachFn.apply(originalVitestFn, eachArgs).apply(this, args);
    };
  };

const bindTest = (originalVitestFn: any, eachFn: any) =>
  function (...eachArgs: unknown[]) {
    return function (...args: unknown[]) {
      args[1] = wrapTestInZone(args[1] as (...args: unknown[]) => unknown);
      return eachFn.apply(originalVitestFn, eachArgs).apply(this, args);
    };
  };

(['describe'] as const).forEach((methodName) => {
  const originalVitestFn = env[methodName] as any;
  env[methodName] = function (...args: unknown[]) {
    args[1] = wrapDescribeInZone(args[1] as (...args: unknown[]) => unknown);
    return originalVitestFn.apply(this, args);
  };
  (env[methodName] as any).each = bindDescribe(originalVitestFn, originalVitestFn.each);
  (env[methodName] as any).only = bindDescribe(originalVitestFn, originalVitestFn.only);
  (env[methodName] as any).skip = bindDescribe(originalVitestFn, originalVitestFn.skip);
});

(['test', 'it'] as const).forEach((methodName) => {
  const originalVitestFn = env[methodName] as any;
  env[methodName] = function (...args: unknown[]) {
    args[1] = wrapTestInZone(args[1] as (...args: unknown[]) => unknown);
    return originalVitestFn.apply(this, args);
  };
  (env[methodName] as any).each = bindTest(originalVitestFn, originalVitestFn.each);
  (env[methodName] as any).only = bindTest(originalVitestFn, originalVitestFn.only);
  (env[methodName] as any).skip = bindTest(originalVitestFn, originalVitestFn.skip);
  (env[methodName] as any).todo = (...args: unknown[]) => originalVitestFn.todo.apply(this, args);
});

(['beforeEach', 'afterEach', 'beforeAll', 'afterAll'] as const).forEach((methodName) => {
  const originalVitestFn = env[methodName] as any;
  env[methodName] = function (...args: unknown[]) {
    args[0] = wrapTestInZone(args[0] as (...args: unknown[]) => unknown);
    return originalVitestFn.apply(this, args);
  };
});
}
