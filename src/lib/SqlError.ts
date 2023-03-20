export class SqlError extends Error {
  constructor(cause: unknown, sql: string) {
    super(`${sql}\n│\n└──── ${cause}`, {cause})
  }
}
