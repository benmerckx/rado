import type {BindParams, Database as Client} from 'sql.js'
import {SyncDatabase, type TransactionOptions} from '../core/Database.ts'
import type {BatchQuery, SyncDriver, SyncStatement} from '../core/Driver.ts'
import {sqliteDialect} from '../sqlite.ts'
import {sqliteDiff} from '../sqlite/diff.ts'
import {execTransaction} from '../sqlite/transactions.ts'

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
  supportsTransactions = true

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
    return execTransaction(
      this,
      this.depth,
      depth => new SqlJsDriver(this.client, depth),
      run,
      options
    )
  }
}

export function connect(db: Client): SyncDatabase<'sqlite'> {
  return new SyncDatabase(new SqlJsDriver(db), sqliteDialect, sqliteDiff)
}
