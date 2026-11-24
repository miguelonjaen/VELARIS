import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

type UnknownFunction = (...args: any[]) => any;
type MockedFunction = UnknownFunction & {
  mock: { calls: any[][] };
  mockImplementation(implementation: UnknownFunction): MockedFunction;
  mockResolvedValue(value: unknown): MockedFunction;
  mockResolvedValueOnce(value: unknown): MockedFunction;
};

function decorateMock(value: UnknownFunction): MockedFunction {
  const native = (value as any).mock;
  const target = ((...args: any[]) => value(...args)) as MockedFunction;
  Object.defineProperty(target, 'mock', { get: () => ({ calls: native.calls.map((call: { arguments: any[] }) => call.arguments) }) });
  target.mockImplementation = (implementation: UnknownFunction) => { native.mockImplementation(implementation); return target; };
  target.mockResolvedValue = (resolved: unknown) => target.mockImplementation(() => Promise.resolve(resolved));
  target.mockResolvedValueOnce = (resolved: unknown) => { native.mockImplementationOnce(() => Promise.resolve(resolved)); return target; };
  return target;
}

export const vi = {
  fn: (implementation: UnknownFunction = () => undefined): MockedFunction => decorateMock(mock.fn(implementation) as UnknownFunction),
  spyOn: (object: object, key: string): MockedFunction => decorateMock(mock.method(object as any, key as any) as UnknownFunction),
  restoreAllMocks: (): void => mock.restoreAll()
};

const ARRAY_CONTAINING = Symbol('arrayContaining');
interface ArrayContaining { [ARRAY_CONTAINING]: readonly unknown[] }
function equal(actual: unknown, expected: unknown): boolean {
  if (expected && typeof expected === 'object' && ARRAY_CONTAINING in expected) {
    if (!Array.isArray(actual)) return false;
    return (expected as ArrayContaining)[ARRAY_CONTAINING].every(item => actual.some(candidate => equal(candidate, item)));
  }
  try { assert.deepStrictEqual(actual, expected); return true; } catch { return false; }
}
function property(value: unknown, path: string): { exists: boolean; value: unknown } {
  let cursor: unknown = value;
  for (const part of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object' || !(part in cursor)) return { exists: false, value: undefined };
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return { exists: true, value: cursor };
}
function matchers(actual: any, negated: boolean) {
  const check = (condition: boolean, message: string): void => assert.equal(negated ? !condition : condition, true, message);
  const calls = (): number => actual?.mock?.calls?.length ?? 0;
  return {
    toBe: (expected: unknown) => check(Object.is(actual, expected), 'Expected identical values'),
    toEqual: (expected: unknown) => check(equal(actual, expected), 'Expected deeply equal values'),
    toMatchObject: (expected: object) => { try { assert.partialDeepStrictEqual(actual, expected); check(true, ''); } catch { check(false, 'Expected matching object'); } },
    toBeNull: () => check(actual === null, 'Expected null'), toBeUndefined: () => check(actual === undefined, 'Expected undefined'),
    toBeDefined: () => check(actual !== undefined, 'Expected defined value'),
    toBeInstanceOf: (expected: new (...args: any[]) => unknown) => check(actual instanceof expected, 'Expected instance'),
    toContain: (expected: unknown) => check(typeof actual === 'string' ? actual.includes(String(expected)) : Array.isArray(actual) && actual.includes(expected), 'Expected contained value'),
    toHaveLength: (expected: number) => check(actual?.length === expected, 'Expected length'),
    toHaveProperty: (path: string, expected?: unknown) => { const result = property(actual, path); check(result.exists && (expected === undefined || equal(result.value, expected)), 'Expected property'); },
    toBeCloseTo: (expected: number, digits = 2) => check(Math.abs(Number(actual) - expected) < 0.5 * 10 ** -digits, 'Expected close number'),
    toBeGreaterThan: (expected: number) => check(actual > expected, 'Expected greater value'), toBeGreaterThanOrEqual: (expected: number) => check(actual >= expected, 'Expected greater or equal value'),
    toBeLessThan: (expected: number) => check(actual < expected, 'Expected lesser value'), toBeLessThanOrEqual: (expected: number) => check(actual <= expected, 'Expected lesser or equal value'),
    toHaveBeenCalled: () => check(calls() > 0, 'Expected call'), toHaveBeenCalledOnce: () => check(calls() === 1, 'Expected one call'),
    toHaveBeenCalledTimes: (expected: number) => check(calls() === expected, 'Expected call count'),
    toThrow: (expected?: RegExp | string | (new (...args: any[]) => Error)) => {
      let thrown: unknown; try { actual(); } catch (error) { thrown = error; }
      let valid = thrown !== undefined;
      if (valid && expected instanceof RegExp) valid = expected.test(String((thrown as Error).message));
      else if (valid && typeof expected === 'string') valid = String((thrown as Error).message).includes(expected);
      else if (valid && typeof expected === 'function') valid = thrown instanceof expected;
      check(valid, 'Expected function to throw');
    }
  };
}
export function expect(actual: unknown): ReturnType<typeof matchers> & { not: ReturnType<typeof matchers> } {
  return Object.assign(matchers(actual, false), { not: matchers(actual, true) });
}
expect.arrayContaining = (values: readonly unknown[]): ArrayContaining => ({ [ARRAY_CONTAINING]: values });
export { afterEach, beforeEach, describe, it };
