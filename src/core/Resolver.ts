import {Batch, type RowMapper} from './Batch.ts'
import type {Dialect} from './Dialect.ts'
import {
  type Driver,
  type DriverSpecs,
  type PrepareOptions,
  type Statement
} from './Driver.ts'
import type {Emitter} from './Emitter.ts'
import {
  type HasQuery,
  type HasSql,
  getSelection,
  hasQuery,
  hasSelection
} from './Internal.ts'
import type {MutationResult, QueryMeta} from './MetaData.ts'
import type {MapRowContext} from './Selection.ts'

export class Resolver<Meta extends QueryMeta = QueryMeta> {
  declare private brand: [Meta]
  #driver: Driver
  #dialect: Dialect

  constructor(driver: Driver, dialect: Dialect) {
    this.#driver = driver
    this.#dialect = dialect
  }

  toSQL(query: HasQuery): {sql: string; params: Array<unknown>} {
    const emitter = this.#dialect.emit(query)
    return {sql: emitter.sql, params: emitter.bind()}
  }

  get(query: HasSql | HasQuery): unknown | Promise<unknown> {
    if (hasQuery(query))
      return this.#executeQuery(query, statement => statement.get())
    return this.#executeRaw(query, undefined, (statement, params) =>
      statement.get(params)
    )
  }

  all(
    query: HasSql | HasQuery,
    options?: PrepareOptions
  ): unknown | Promise<unknown> {
    if (hasQuery(query))
      return this.#executeQuery(query, statement => statement.all())
    return this.#executeRaw(query, options, (statement, params) =>
      statement.all(params)
    )
  }

  run(query: HasQuery): unknown | Promise<unknown> {
    return this.#executeQuery(query, statement => statement.run())
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

  #executeRaw<Result>(
    query: HasSql,
    options: PrepareOptions | undefined,
    run: (
      statement: Statement,
      params: Array<unknown>
    ) => Result | Promise<Result>
  ): Result | Promise<Result> {
    const emitter = this.#dialect.emit(query)
    const statement = this.#driver.prepare(emitter.sql, options)
    return this.#execute(statement, () => run(statement, emitter.bind()))
  }

  #executeQuery<Result>(
    query: HasQuery,
    run: (statement: PreparedStatement<Meta>) => Result | Promise<Result>
  ): Result | Promise<Result> {
    const statement = this.prepare(query, '')
    return this.#execute(statement, () => run(statement))
  }

  #execute<Result>(
    statement: Statement | PreparedStatement<Meta>,
    run: () => Result | Promise<Result>
  ): Result | Promise<Result> {
    try {
      const result = run()
      if (result instanceof Promise)
        return result.finally(() => statement.free()) as Promise<Result>
      statement.free()
      return result
    } catch (error) {
      statement.free()
      throw error
    }
  }
}

export class PreparedStatement<Meta extends QueryMeta> {
  declare private brand: [Meta]
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
    if (rows instanceof Promise) return rows.then(rows => rows[0] ?? null)
    return rows[0] ?? null
  }

  run(inputs?: Record<string, unknown>): unknown {
    return this.#stmt.run(this.#emitter.bind(inputs))
  }

  async execute(
    inputs?: Record<string, unknown>
  ): Promise<unknown | MutationResult<Meta>> {
    if (!this.#mapRow)
      return this.#stmt.run(this.#emitter.bind(inputs)) as
        | MutationResult<Meta>
        | Promise<MutationResult<Meta>>
    return this.all(inputs)
  }

  free(): void {
    this.#stmt.free()
  }

  [Symbol.dispose](): void {
    this.free()
  }
}
