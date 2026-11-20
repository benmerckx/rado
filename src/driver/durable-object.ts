import {Batch} from '../core/Batch.ts'
import {
  type DatabaseOptions,
  SyncDatabase,
  type TransactionOptions
} from '../core/Database.ts'
import type {BatchedQuery, SyncDriver, SyncStatement} from '../core/Driver.ts'
import type {MutationResultBase} from '../core/MetaData.ts'
import {sqliteDialect} from '../sqlite.ts'

type Storage = DurableObjectStorage

function toParam(param: unknown) {
  if (typeof param === 'boolean') return Number(param)
  if (typeof param === 'bigint')
    return Number.isSafeInteger(Number(param)) ? Number(param) : String(param)
  return param
}

function fromValue(value: unknown) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return value
}

class PreparedStatement implements SyncStatement {
  constructor(
    private sql: SqlStorage,
    private query: string
  ) {}

  #exec(params: Array<unknown>) {
    return this.sql.exec(this.query, ...params.map(toParam))
  }

  all(params: Array<unknown>): Array<object> {
    const cursor = this.#exec(params)
    const {columnNames} = cursor
    return Array.from(cursor.raw(), row =>
      Object.fromEntries(
        columnNames.map((name, index) => [name, fromValue(row[index])])
      )
    )
  }

  run(params: Array<unknown>): MutationResultBase {
    this.#exec(params).toArray()
    // rowsWritten also counts index writes, changes() is exact
    return this.sql
      .exec<{affectedRows: number; insertId: number}>(
        'select changes() as affectedRows, last_insert_rowid() as insertId'
      )
      .one()
  }

  get(params: Array<unknown>): object | null {
    return this.all(params)[0] ?? null
  }

  values(params: Array<unknown>): Array<Array<unknown>> {
    return Array.from(this.#exec(params).raw(), row => row.map(fromValue))
  }

  free() {}
}

export class DurableObjectDriver implements SyncDriver {
  parsesJson = false
  supportsTransactions = true

  constructor(private storage: Storage) {}

  exec(query: string): void {
    this.storage.sql.exec(query).toArray()
  }

  close() {}

  prepare(sql: string): PreparedStatement {
    return new PreparedStatement(this.storage.sql, sql)
  }

  batch(queries: Array<BatchedQuery>): Array<Array<unknown>> {
    return this.storage.transactionSync(() => Batch.run(this, queries))
  }

  // Durable Objects reject begin and savepoint statements, the storage API
  // nests transactions itself
  transaction<T>(
    run: (inner: SyncDriver) => T,
    options: TransactionOptions['sqlite']
  ): T {
    if (options.async)
      return this.storage.transaction(async () => run(this)) as T
    return this.storage.transactionSync(() => run(this))
  }
}

export function connect(
  storage: Storage,
  options?: DatabaseOptions
): SyncDatabase<'sqlite'> {
  return new SyncDatabase(
    new DurableObjectDriver(storage),
    sqliteDialect,
    options
  )
}
