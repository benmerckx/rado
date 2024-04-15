import type {Dialect} from './Dialect.ts'
import type {Driver, Statement} from './Driver.ts'
import type {Emitter} from './Emitter.ts'
import {type HasQuery, getSelection, hasSelection} from './Internal.ts'
import type {QueryMeta} from './MetaData.ts'

export class Resolver<Meta extends QueryMeta = QueryMeta> {
  #meta?: Meta
  #driver: Driver
  #dialect: Dialect

  constructor(driver: Driver, dialect: Dialect) {
    this.#driver = driver
    this.#dialect = dialect
  }

  prepare(query: HasQuery, name: string): PreparedStatement<Meta> {
    const isSelection = hasSelection(query)
    const mapRow = isSelection ? getSelection(query).mapRow : undefined
    const emitter = this.#dialect(query)
    const stmt = this.#driver.prepare(emitter.sql)
    return new PreparedStatement<Meta>(emitter, stmt, mapRow)
  }
}

type RowMapper = ((values: Array<unknown>) => unknown) | undefined

export class PreparedStatement<Meta extends QueryMeta> {
  #meta?: Meta
  #emitter: Emitter<Meta>
  #stmt: Statement
  #mapRow: RowMapper

  constructor(emitter: Emitter<Meta>, stmt: Statement, mapRow: RowMapper) {
    this.#emitter = emitter
    this.#stmt = stmt
    this.#mapRow = mapRow
  }

  #transform = (rows: Array<unknown>) => {
    return this.#mapRow ? (<Array<Array<unknown>>>rows).map(this.#mapRow) : rows
  }

  all(
    inputs?: Record<string, unknown>
  ): Array<unknown> | Promise<Array<unknown>> {
    const rows = this.#stmt.values(this.#emitter.params)
    if (rows instanceof Promise) return rows.then(this.#transform)
    return this.#transform(rows)
  }

  get(inputs?: Record<string, unknown>): unknown | Promise<unknown> {
    const rows = this.all()
    if (rows instanceof Promise) return rows.then(rows => rows[0])
    return rows[0]
  }

  run(inputs?: Record<string, unknown>): unknown {
    return this.#stmt.run(this.#emitter.params)
  }

  execute(inputs?: Record<string, unknown>): unknown {
    return this.#stmt.all(this.#emitter.params)
  }

  free(): void {
    this.#stmt.free()
  }
}
