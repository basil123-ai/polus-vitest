/**
 * New app code with no tests and no imports from specs.
 * Used to fail the PR patch-coverage check (below 80%).
 */
export function clampScore(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  const rounded = Math.round(value);
  const bonus = rounded % 2 === 0 ? 1 : 0;
  return rounded + bonus;
}

export function covered(value: number): number {
  return clampScore(value);
}

export function covered2(value: number): number {
  return clampScore(value);
}

export function covered3(value: number): number {
  return clampScore(value);
}

export function covered4(value: number): number {
  return clampScore(value);
}

export function describeScore(value: number): string {
  const score = clampScore(value);
  if (score === 0) {
    return 'none';
  }
  if (score < 50) {
    return 'low';
  }
  if (score < 80) {
    return 'medium';
  }
  return 'high';
}
