// @ts-ignore
import type {Database as Client, Statement} from 'jsr:@db/sqlite'
import {SyncDatabase, type TransactionOptions} from '../../core/Database.ts'
import type {BatchQuery, SyncDriver, SyncStatement} from '../../core/Driver.ts'
import {sqliteDialect} from '../../sqlite.ts'
import {sqliteDiff} from '../../sqlite/diff.ts'
import {execTransaction} from '../../sqlite/transactions.ts'

class PreparedStatement implements SyncStatement {
  constructor(private stmt: Statement<unknown>) {}

  all(params: Array<unknown>) {
    return <Array<object>>this.stmt.all(...params)
  }

  run(params: Array<unknown>) {
    return this.stmt.run(...params)
  }

  get(params: Array<unknown>) {
    return <object>this.stmt.get(...params)
  }

  values(params: Array<unknown>) {
    return this.stmt.values(...params)
  }

  free() {
    this.stmt.finalize()
  }
}

class DbSqliteDriver implements SyncDriver {
  parsesJson = true
  parsesNestedJson = false

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
    return new PreparedStatement(this.client.prepare(sql))
  }

  batch(queries: Array<BatchQuery>): Array<Array<unknown>> {
    return this.transaction(tx => {
      return queries.map(({sql, params}) => tx.prepare(sql).values(params))
    }, {})
  }

  transaction<T>(
    run: (inner: SyncDriver) => T,
    options: TransactionOptions['sqlite']
  ): T {
    return execTransaction(
      this,
      this.depth,
      depth => new DbSqliteDriver(this.client, depth),
      run,
      options
    )
  }
}

export function connect(db: Client): SyncDatabase<'sqlite'> {
  return new SyncDatabase(new DbSqliteDriver(db), sqliteDialect, sqliteDiff)
}
