import type {BindParams, Database as Client} from 'sql.js'
import {SyncDatabase, type TransactionOptions} from '../core/Database.ts'
import type {BatchQuery, SyncDriver, SyncStatement} from '../core/Driver.ts'
import {sqliteDialect} from '../sqlite.ts'

class PreparedStatement implements SyncStatement {
  constructor(
    private client: Client,
    private stmt: ReturnType<Client['prepare']>
  ) {}

  *iterate<T>(params: Array<unknown>): IterableIterator<T> {
    this.stmt.bind(params as BindParams)
    while (this.stmt.step()) yield this.stmt.getAsObject() as T
    this.stmt.reset()
  }

  *iterateValues(params: Array<unknown>) {
    this.stmt.bind(params as BindParams)
    while (this.stmt.step()) yield this.stmt.get()
    this.stmt.reset()
  }

  all(params: Array<unknown>): Array<object> {
    return Array.from(this.iterate(params))
  }

  run(params: Array<unknown>): {rowsAffected: number} {
    this.stmt.run(params as BindParams)
    this.stmt.reset()
    return {rowsAffected: this.client.getRowsModified()}
  }

  get(params: Array<unknown>) {
    return this.all(params)[0] ?? null
  }

  values(params: Array<unknown>) {
    return Array.from(this.iterateValues(params))
  }

  free() {
    this.stmt.free()
  }
}

class SqlJsDriver implements SyncDriver {
  parsesJson = false

  constructor(
    private client: Client,
    private depth = 0
  ) {}

  exec(query: string): void {
    this.client.exec(query)
  }

  close() {
    this.client.close()
  }

  prepare(sql: string) {
    return new PreparedStatement(this.client, this.client.prepare(sql))
  }

  batch(queries: Array<BatchQuery>): Array<Array<unknown>> {
    return this.transaction(
      tx => queries.map(({sql, params}) => tx.prepare(sql).values(params)),
      {}
    )
  }

  transaction<T>(
    run: (inner: SyncDriver) => T,
    options: TransactionOptions['sqlite']
  ): T {
    const behavior = options.behavior ?? 'deferred'
    this.exec(this.depth > 0 ? `savepoint d${this.depth}` : `begin ${behavior}`)
    try {
      const result = run(new SqlJsDriver(this.client, this.depth + 1))
      this.exec(this.depth > 0 ? `release d${this.depth}` : 'commit')
      return result
    } catch (error) {
      this.exec(this.depth > 0 ? `rollback to d${this.depth}` : 'rollback')
      throw error
    }
  }
}

export function connect(db: Client) {
  return new SyncDatabase(new SqlJsDriver(db), sqliteDialect)
}
