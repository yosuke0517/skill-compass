export function verifyFixedPassword(expected: string, actual: string): boolean {
  return expected.length > 0 && actual === expected;
}
