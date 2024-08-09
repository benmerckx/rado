import type {Emitter} from './Emitter.ts'
import {
  getQuery,
  getSql,
  hasQuery,
  type HasQuery,
  type HasSql
} from './Internal.ts'

export class Dialect {
  #createEmitter: new () => Emitter
  constructor(createEmitter: new () => Emitter) {
    this.#createEmitter = createEmitter
  }
  emit = (input: HasSql | HasQuery): Emitter => {
    const sql = hasQuery(input) ? getQuery(input) : getSql(input)
    const emitter = new this.#createEmitter()
    sql.emitTo(emitter)
    return emitter
  }
  inline = (input: HasSql | HasQuery): string => {
    const sql = hasQuery(input) ? getQuery(input) : getSql(input)
    const emitter = new this.#createEmitter()
    sql.inlineValues().emitTo(emitter)
    return emitter.sql
  }
}
