import type {Database as Client, Statement} from 'better-sqlite3'
import {Batch} from '../core/Batch.ts'
import {
  type DatabaseOptions,
  SyncDatabase,
  type TransactionOptions
} from '../core/Database.ts'
import type {
  BatchedQuery,
  PrepareOptions,
  SyncDriver,
  SyncStatement
} from '../core/Driver.ts'
import type {MutationResultBase} from '../core/MetaData.ts'
import {sqliteDialect} from '../sqlite.ts'
import {sqliteDiff} from '../sqlite/diff.ts'
import {ReusedStatement, StatementCache} from '../sqlite/statements.ts'
import {execTransaction} from '../sqlite/transactions.ts'

class PreparedStatement
  extends ReusedStatement<Statement>
  implements SyncStatement
{
  constructor(
    statements: StatementCache<Statement>,
    sql: string,
    private isSelection: boolean
  ) {
    super(statements, sql)
  }

  all(params: Array<unknown>) {
    return <Array<object>>this.stmt.all(...params)
  }

  run(params: Array<unknown>): MutationResultBase {
    const result = this.stmt.run(...params)
    return {
      affectedRows: result.changes,
      insertId: result.lastInsertRowid
    }
  }

  get(params: Array<unknown>) {
    return <object>this.stmt.get(...params) ?? null
  }

  values(params: Array<unknown>) {
    if (!this.isSelection) {
      this.stmt.run(...params)
      return []
    }
    // The statement is shared, so raw mode must not outlive this call
    try {
      return this.stmt.raw(true).all(...params) as Array<Array<unknown>>
    } finally {
      this.stmt.raw(false)
    }
  }
}

class BetterSqlite3Driver implements SyncDriver {
  parsesJson = false
  supportsTransactions = true

  constructor(
    private client: Client,
    private depth = 0,
    private statements = new StatementCache<Statement>(
      sql => client.prepare(sql),
      () => {}
    )
  ) {}

  exec(query: string): void {
    this.statements.invalidate(query)
    this.client.exec(query)
  }

  close() {
    this.statements.clear()
    this.client.close()
  }

  prepare(sql: string, options?: PrepareOptions) {
    return new PreparedStatement(
      this.statements,
      sql,
      options?.isSelection ?? false
    )
  }

  batch(queries: Array<BatchedQuery>): Array<Array<unknown>> {
    return this.transaction(tx => Batch.run(tx, queries), {})
  }

  transaction<T>(
    run: (inner: SyncDriver) => T,
    options: TransactionOptions['sqlite']
  ): T {
    return execTransaction(
      this,
      this.depth,
      depth => new BetterSqlite3Driver(this.client, depth, this.statements),
      run,
      options
    )
  }
}

export function connect(
  db: Client,
  options?: DatabaseOptions
): SyncDatabase<'sqlite'> {
  return new SyncDatabase(
    new BetterSqlite3Driver(db),
    sqliteDialect,
    sqliteDiff,
    options
  )
}
