import type {Dialect} from './Dialect.ts'
import type {BatchQuery, Driver, DriverSpecs, Statement} from './Driver.ts'
import type {Emitter} from './Emitter.ts'
import {
  getSelection,
  hasSelection,
  type HasQuery,
  type HasSql
} from './Internal.ts'
import type {QueryMeta} from './MetaData.ts'
import type {MapRowContext} from './Selection.ts'

export class Resolver<Meta extends QueryMeta = QueryMeta> {
  private declare brand: [Meta]
  #driver: Driver
  #dialect: Dialect

  constructor(driver: Driver, dialect: Dialect) {
    this.#driver = driver
    this.#dialect = dialect
  }

  prepare(query: HasQuery, name?: string): PreparedStatement<Meta> {
    const isSelection = hasSelection(query)
    const mapRow = isSelection ? getSelection(query).mapRow : undefined
    const emitter = this.#dialect.emit(query)
    const stmt = this.#driver.prepare(emitter.sql, {
      isSelection,
      name
    })
    return new PreparedStatement<Meta>(emitter, stmt, mapRow, this.#driver)
  }

  batch(queries: Array<HasSql | HasQuery>): Batch<Meta> {
    return new Batch(
      this.#driver,
      queries.map(query => {
        const isSelection = hasSelection(query)
        const mapRow = isSelection ? getSelection(query).mapRow : undefined
        const emitter = this.#dialect.emit(query)
        return {sql: emitter.sql, params: emitter.bind(), isSelection, mapRow}
      })
    )
  }
}

type RowMapper = ((ctx: MapRowContext) => unknown) | undefined

interface QueryWithMapRow extends BatchQuery {
  mapRow: RowMapper
}

export class Batch<Meta extends QueryMeta> {
  private declare brand: [Meta]
  #driver: Driver
  #queries: Array<QueryWithMapRow>

  constructor(driver: Driver, queries: Array<QueryWithMapRow>) {
    this.#driver = driver
    this.#queries = queries
  }

  #transform = (results: Array<Array<unknown>>) => {
    const ctx: MapRowContext = {
      values: undefined!,
      index: 0,
      specs: this.#driver
    }
    for (let i = 0; i < this.#queries.length; i++) {
      const {mapRow} = this.#queries[i]
      if (!mapRow) continue
      const rows = results[i] as Array<Array<unknown>>
      for (let j = 0; j < results[i].length; j++) {
        ctx.values = rows[i]
        ctx.index = 0
        rows[i] = mapRow(ctx) as Array<unknown>
      }
    }
    return results
  }

  execute(): Array<unknown> | Promise<Array<unknown>> {
    const results = this.#driver.batch(this.#queries)
    if (results instanceof Promise) return results.then(this.#transform)
    return this.#transform(results)
  }
}

export class PreparedStatement<Meta extends QueryMeta> {
  private declare brand: [Meta]
  #emitter: Emitter
  #stmt: Statement
  #mapRow: RowMapper
  #specs: DriverSpecs

  constructor(
    emitter: Emitter,
    stmt: Statement,
    mapRow: RowMapper,
    specs: DriverSpecs
  ) {
    this.#emitter = emitter
    this.#stmt = stmt
    this.#mapRow = mapRow
    this.#specs = specs
  }

  #transform = (rows: Array<Array<unknown>>) => {
    if (!this.#mapRow) return rows
    const ctx: MapRowContext = {
      values: undefined!,
      index: 0,
      specs: this.#specs
    }
    for (let i = 0; i < rows.length; i++) {
      ctx.values = rows[i]
      ctx.index = 0
      rows[i] = this.#mapRow(ctx) as Array<unknown>
    }
    return rows
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
