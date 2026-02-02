import type {Emitter} from './Emitter.ts'
import {type HasQuery, type HasValue, get} from './Internal.ts'
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
  emit = (input: HasValue | HasQuery): Emitter => {
    const {query, value} = get(input)
    const sql = query ?? value
    if (!sql) throw new Error('Invalid SQL input')
    const emitter = new this.#createEmitter(this.runtime)
    sql.emit(emitter)
    return emitter
  }
  inline = (input: HasValue | HasQuery): string => {
    const {query, value} = get(input)
    const sql = query ?? value
    if (!sql) throw new Error('Invalid SQL input')
    const emitter = new this.#createEmitter(this.runtime)
    sql.inlineValues().emit(emitter)
    return emitter.sql
  }
}
