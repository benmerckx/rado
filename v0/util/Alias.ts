export function randomAlias(): string {
  return `__${Math.random().toString(36).slice(2, 9)}`
}
