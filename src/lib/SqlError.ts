export class SqlError extends Error {
  constructor(cause: Error, sql: string) {
    super(`${sql}\n│\n└──── ${cause}`, {cause})
  }
}
