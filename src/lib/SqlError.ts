export class SqlError extends Error {
  constructor(cause: Error, public sql: string) {
    super(`${sql}\n│\n└──── ${cause}`, {cause})
  }
}
