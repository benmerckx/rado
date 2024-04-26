import type {Dialect} from './Dialect.ts'
import type {Driver, Statement} from './Driver.ts'
import type {Emitter} from './Emitter.ts'
import {getSelection, hasSelection, type HasQuery} from './Internal.ts'
import type {QueryMeta} from './MetaData.ts'

export class Resolver<Meta extends QueryMeta = QueryMeta> {
  private declare brand?: [Meta]
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
    const stmt = this.#driver.prepare(emitter.sql, name)
    return new PreparedStatement<Meta>(emitter, stmt, mapRow)
  }
}

type RowMapper = ((values: Array<unknown>) => unknown) | undefined

export class PreparedStatement<Meta extends QueryMeta> {
  private declare brand?: [Meta]
  #emitter: Emitter
  #stmt: Statement
  #mapRow: RowMapper

  constructor(emitter: Emitter, stmt: Statement, mapRow: RowMapper) {
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
    const rows = this.#stmt.values(this.#emitter.bind(inputs))
    if (rows instanceof Promise) return rows.then(this.#transform)
    return this.#transform(rows)
  }

  get(inputs?: Record<string, unknown>): unknown | Promise<unknown> {
    const rows = this.all(inputs)
    if (rows instanceof Promise) return rows.then(rows => rows[0])
    return rows[0]
  }

  run(inputs?: Record<string, unknown>): unknown {
    return this.#stmt.run(this.#emitter.bind(inputs))
  }

  async execute(inputs?: Record<string, unknown>): Promise<unknown> {
    return this.all(inputs)
  }

  free(): void {
    this.#stmt.free()
  }
}
