import type {Emitter} from './Emitter.ts'
import {
  getQuery,
  getSql,
  hasSql,
  type HasQuery,
  type HasSql
} from './Internal.ts'

export class Dialect {
  #createEmitter: new () => Emitter
  constructor(createEmitter: new () => Emitter) {
    this.#createEmitter = createEmitter
  }
  emit = (input: HasSql | HasQuery) => {
    const sql = hasSql(input) ? getSql(input) : getQuery(input)
    const emitter = new this.#createEmitter()
    sql.emitTo(emitter)
    return emitter
  }
  inline = (input: HasSql | HasQuery) => {
    const sql = hasSql(input) ? getSql(input) : getQuery(input)
    const emitter = new this.#createEmitter()
    sql.inlineValues().emitTo(emitter)
    return emitter.sql
  }
}

export function dialect(createEmitter: new () => Emitter) {
  return new Dialect(createEmitter)
}
