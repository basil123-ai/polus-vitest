/** Untested on purpose — pre-commit should reject this file (patch coverage < 80%). */
export function neverCovered(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'empty';
  }
  if (trimmed.length < 3) {
    return 'short';
  }
  return trimmed.toUpperCase();
}


export function covered(value: string): string {
  return value.toUpperCase();
}

export function covered2(value: string): string {
  return value.toUpperCase();
}

export function covered3(value: string): string {
  return value.toUpperCase();
}

export function covered4(value: string): string {
  return value.toUpperCase();
}