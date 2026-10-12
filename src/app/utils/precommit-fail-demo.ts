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
