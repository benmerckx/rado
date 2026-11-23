export class Rollback<Data = never> extends Error {
  constructor(public data: Data) {
    super('Rollback')
  }
}
