import type {Emitter} from './Emitter.ts'
import {
  type HasQuery,
  type HasSql,
  getQuery,
  getSql,
  hasQuery
} from './Internal.ts'
import type {Runtime} from './MetaData.ts'

export class Dialect {
  runtime: Runtime
  #createEmitter: new (
    runtime: Runtime
  ) => Emitter
  constructor(
    runtime: Runtime,
    createEmitter: new (runtime: Runtime) => Emitter
  ) {
    this.runtime = runtime
    this.#createEmitter = createEmitter
  }
  emit = (input: HasSql | HasQuery): Emitter => {
    const sql = hasQuery(input) ? getQuery(input) : getSql(input)
    const emitter = new this.#createEmitter(this.runtime)
    sql.emit(emitter)
    return emitter
  }
  inline = (input: HasSql | HasQuery): string => {
    const sql = hasQuery(input) ? getQuery(input) : getSql(input)
    const emitter = new this.#createEmitter(this.runtime)
    sql.inlineValues().emit(emitter)
    return emitter.sql
  }
}
