import type {PGlite, Transaction} from '@electric-sql/pglite'
import type {AsyncDriver, AsyncStatement} from '../core/Driver.ts'
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
  constructor(private client: Queryable) {}

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

  async transaction<T>(
    run: (inner: AsyncDriver) => Promise<T>,
    options: TransactionOptions['postgres']
  ): Promise<T> {
    if ('transaction' in this.client)
      return this.client.transaction((tx: Transaction) => {
        return run(new PGliteDriver(tx))
      }) as Promise<T>
    throw new Error('Cannot nest transactions in PGLite')
  }
}

export function connect(db: PGlite) {
  return new AsyncDatabase<'postgres'>(new PGliteDriver(db), postgresDialect)
}
