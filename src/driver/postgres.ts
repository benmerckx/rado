import type {Sql, TransactionSql} from 'postgres'
import {Batch} from '../core/Batch.ts'
import {
  AsyncDatabase,
  type DatabaseOptions,
  type TransactionOptions
} from '../core/Database.ts'
import type {
  AsyncDriver,
  AsyncStatement,
  BatchedQuery,
  PrepareOptions
} from '../core/Driver.ts'
import type {MutationResultBase} from '../core/MetaData.ts'
import {postgresDialect} from '../postgres/dialect.ts'
import {setTransaction} from '../postgres/transactions.ts'

type Client = Sql<any>
type Queryable = Client | TransactionSql<any>

class PreparedStatement implements AsyncStatement {
  constructor(
    private client: Queryable,
    private sql: string,
    private name?: string
  ) {}

  #query(params: Array<unknown>) {
    return this.client.unsafe(this.sql, params as Array<any>, {
      prepare: this.name !== undefined
    })
  }

  all(params: Array<unknown>): Promise<Array<object>> {
    return this.#query(params).then(rows => Array.from(rows))
  }

  async run(params: Array<unknown>): Promise<MutationResultBase> {
    const result = await this.#query(params)
    return {affectedRows: result.count ?? 0}
  }

  get(params: Array<unknown>): Promise<object | null> {
    return this.all(params).then(rows => rows[0] ?? null)
  }

  values(params: Array<unknown>): Promise<Array<Array<unknown>>> {
    return this.#query(params)
      .values()
      .then(rows => Array.from(rows))
  }

  free() {}
}

export class PostgresDriver implements AsyncDriver {
  parsesJson = true
  supportsTransactions = true

  constructor(
    private client: Queryable,
    private depth = 0
  ) {}

  async exec(query: string) {
    await this.client.unsafe(query)
  }

  prepare(sql: string, options?: PrepareOptions): PreparedStatement {
    return new PreparedStatement(this.client, sql, options?.name)
  }

  async close(): Promise<void> {
    if (this.depth > 0 || !('end' in this.client))
      throw new Error('Cannot close a transaction')
    return this.client.end()
  }

  async batch(queries: Array<BatchedQuery>): Promise<Array<Array<unknown>>> {
    const transact = (tx: AsyncDriver) => Batch.run(tx, queries)
    if (this.depth > 0) return transact(this)
    return this.transaction(transact, {})
  }

  async transaction<T>(
    run: (inner: AsyncDriver) => Promise<T>,
    options: TransactionOptions['postgres']
  ): Promise<T> {
    const depth = this.depth + 1
    if ('savepoint' in this.client)
      return this.client.savepoint(tx =>
        run(new PostgresDriver(tx, depth))
      ) as Promise<T>
    return this.client.begin(async tx => {
      await tx.unsafe(setTransaction(options))
      return run(new PostgresDriver(tx, depth))
    }) as Promise<T>
  }
}

function serializeJson(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

export function connect(
  client: Client,
  options?: DatabaseOptions
): AsyncDatabase<'postgres'> {
  // Rado encodes json parameters itself, postgres-js would encode them twice
  for (const oid of [114, 3802]) client.options.serializers[oid] = serializeJson
  return new AsyncDatabase(new PostgresDriver(client), postgresDialect, options)
}
