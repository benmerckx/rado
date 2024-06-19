import type {PGlite, Transaction} from '@electric-sql/pglite'
import type {AsyncDriver, AsyncStatement, BatchQuery} from '../core/Driver.ts'
import {AsyncDatabase, type TransactionOptions} from '../index.ts'
import {postgresDialect} from '../postgres/PostgresDialect.ts'
import {postgresDiff} from '../postgres/PostgresDiff.ts'

type Queryable = PGlite | Transaction

class PreparedStatement implements AsyncStatement {
  constructor(
    private client: Queryable,
    private sql: string
  ) {}

  all(params: Array<unknown>): Promise<Array<object>> {
    return this.client
      .query<object>(this.sql, params, {
        rowMode: 'object'
      })
      .then(res => res.rows)
  }

  async run(params: Array<unknown>) {
    await this.client.query(this.sql, params, {
      rowMode: 'array'
    })
  }

  get(params: Array<unknown>) {
    return this.all(params).then(rows => rows[0] ?? null)
  }

  values(params: Array<unknown>) {
    return this.client
      .query<Array<unknown>>(this.sql, params, {
        rowMode: 'array'
      })
      .then(res => res.rows)
  }

  free() {}
}

export class PGliteDriver implements AsyncDriver {
  parsesJson = true

  constructor(
    private client: Queryable,
    private depth = 0
  ) {}

  async exec(query: string) {
    await this.client.exec(query)
  }

  close() {
    if ('close' in this.client) {
      return Promise.resolve()
      // This fails currently
      // return this.client.close()
    }
    throw new Error('Cannot close a transaction')
  }

  prepare(sql: string) {
    return new PreparedStatement(this.client, sql)
  }

  async batch(queries: Array<BatchQuery>): Promise<Array<Array<unknown>>> {
    const transact = async (tx: AsyncDriver) => {
      const results = []
      for (const {sql, params} of queries)
        results.push(await tx.prepare(sql).values(params))
      return results
    }
    if (this.depth > 0) return transact(this)
    return this.transaction(transact, {})
  }

  async transaction<T>(
    run: (inner: AsyncDriver) => Promise<T>,
    options: TransactionOptions['postgres']
  ): Promise<T> {
    if (this.depth === 0 && 'transaction' in this.client)
      return this.client.transaction((tx: Transaction) => {
        return run(new PGliteDriver(tx, this.depth + 1))
      }) as Promise<T>
    await this.exec(`savepoint d${this.depth}`)
    try {
      const result = await run(new PGliteDriver(this.client, this.depth + 1))
      await this.exec(`release d${this.depth}`)
      return result
    } catch (error) {
      await this.exec(`rollback to d${this.depth}`)
      throw error
    }
  }
}

export function connect(db: PGlite) {
  return new AsyncDatabase<'postgres'>(
    new PGliteDriver(db),
    postgresDialect,
    postgresDiff
  )
}
