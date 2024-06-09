import type {PGlite, Transaction} from '@electric-sql/pglite'
import type {AsyncDriver, AsyncStatement, BatchQuery} from '../core/Driver.ts'
import {AsyncDatabase, type TransactionOptions} from '../index.ts'
import {postgresDialect} from '../postgres/PostgresDialect.ts'

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
    return this.transaction(async tx => {
      const results = []
      for (const {sql, params} of queries)
        results.push(await tx.prepare(sql).values(params))
      return results
    }, {})
  }

  async transaction<T>(
    run: (inner: AsyncDriver) => Promise<T>,
    options: TransactionOptions['postgres']
  ): Promise<T> {
    this.exec(this.depth > 0 ? `savepoint d${this.depth}` : 'begin')
    try {
      const result = run(new PGliteDriver(this.client, this.depth + 1))
      this.exec(this.depth > 0 ? `release d${this.depth}` : 'commit')
      return result
    } catch (error) {
      this.exec(this.depth > 0 ? `rollback to d${this.depth}` : 'rollback')
      throw error
    }
  }
}

export function connect(db: PGlite) {
  return new AsyncDatabase<'postgres'>(new PGliteDriver(db), postgresDialect)
}
