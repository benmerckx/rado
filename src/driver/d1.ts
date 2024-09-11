import {AsyncDatabase} from '../core/Database.ts'
import type {
  AsyncDriver,
  AsyncStatement,
  BatchQuery,
  PrepareOptions
} from '../core/Driver.ts'
import {sqliteDialect} from '../sqlite.ts'
import {sqliteDiff} from '../sqlite/diff.ts'

type Client = D1Database

class PreparedStatement implements AsyncStatement {
  constructor(
    private stmt: D1PreparedStatement,
    private isSelection: boolean
  ) {}

  async all(params: Array<unknown>): Promise<Array<object>> {
    return this.stmt
      .bind(...params)
      .all<object>()
      .then(({results}) => results)
  }

  async run(params: Array<unknown>) {
    const results = await this.stmt.bind(...params).run()
    // return {rowsAffected: results.meta.rows_written}
  }

  async get(params: Array<unknown>): Promise<object | null> {
    return this.stmt.bind(...params).first()
  }

  async values(params: Array<unknown>): Promise<Array<Array<unknown>>> {
    if (this.isSelection) {
      const results = await this.stmt.bind(...params).raw()
      console.log(results)
      return results
    }
    await this.stmt.bind(...params).run()
    return []
  }

  free() {}
}

export class D1Driver implements AsyncDriver {
  parsesJson = false

  constructor(private client: Client) {}

  async exec(query: string) {
    await this.client.exec(query)
  }

  prepare(sql: string, options: PrepareOptions): PreparedStatement {
    return new PreparedStatement(this.client.prepare(sql), options.isSelection)
  }

  async close(): Promise<void> {}

  async batch(queries: Array<BatchQuery>): Promise<Array<Array<unknown>>> {
    const results = []
    for (const {sql, params, isSelection} of queries)
      results.push(await this.prepare(sql, {isSelection}).values(params))
    return results
  }

  async transaction<T>(): Promise<T> {
    throw new Error('Transactions are not supported in D1')
  }
}

export function connect(client: Client): AsyncDatabase<'sqlite'> {
  return new AsyncDatabase(new D1Driver(client), sqliteDialect, sqliteDiff)
}
