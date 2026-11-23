import type {Client, Pool, PoolClient} from 'pg'
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
import {type Parsers, textParsers} from '../postgres/parsers.ts'
import {setTransaction} from '../postgres/transactions.ts'

type Queryable = Client | Pool | PoolClient
type AcquiredClient = {
  client: Queryable
  release?: () => void
}

/**
 * The query interface used by the driver. Packages providing a pg-compatible
 * client, such as @vercel/postgres and @neondatabase/serverless, ship their
 * own copy of the pg types which are not directly assignable to pg's. They
 * are accepted through this minimal structural interface instead.
 */
export interface PgCompatible {
  query(queryConfig: {
    name?: string
    text: string
    values?: Array<unknown>
    rowMode?: string
  }): Promise<{rows: Array<any>; rowCount?: number | null}>
}

// Properties are read rather than checked with `in`: the sql export of
// @vercel/postgres is a Proxy that only forwards reads to its pool
function has(client: Queryable, key: string, type: string): boolean {
  return typeof (client as unknown as Record<string, unknown>)[key] === type
}

function isPool(client: Queryable): client is Pool {
  return (
    has(client, 'connect', 'function') &&
    has(client, 'totalCount', 'number') &&
    has(client, 'idleCount', 'number') &&
    has(client, 'waitingCount', 'number')
  )
}

async function acquireClient(
  client: Queryable,
  depth: number
): Promise<AcquiredClient> {
  if (depth > 0 || !isPool(client)) return {client}
  const acquired = await client.connect()
  return {
    client: acquired as Queryable,
    release: () => acquired.release()
  }
}

interface PoolLike {
  Client?: new (options: unknown) => Parsers
  options?: unknown
}

const poolParsers = new WeakMap<object, Parsers>()

// A query given its own types skips the client's, so those are the fallback.
// A pool has none, but a client made like its own does, and only connects
// once asked to.
function parsersOf(client: Queryable): Parsers | undefined {
  if (has(client, 'getTypeParser', 'function')) return client as Parsers
  const {Client, options} = client as PoolLike
  if (!isPool(client) || !Client) return undefined
  let parsers = poolParsers.get(client)
  if (!parsers) poolParsers.set(client, (parsers = new Client(options)))
  return parsers
}

function types(client: Queryable): Parsers | undefined {
  const parsers = parsersOf(client)
  return parsers && textParsers(parsers)
}

interface QueryConfig {
  name?: string
  text: string
  values: Array<unknown>
  rowMode?: 'array'
}

class PreparedStatement implements AsyncStatement {
  constructor(
    private client: Queryable,
    private sql: string,
    private name?: string
  ) {}

  async #query(params: Array<unknown>, rowMode?: 'array') {
    const config: QueryConfig = {
      name: this.name,
      text: this.sql,
      values: params
    }
    if (rowMode) config.rowMode = rowMode
    return this.client.query({...config, types: types(this.client)})
  }

  all(params: Array<unknown>): Promise<Array<object>> {
    return this.#query(params).then(res => res.rows)
  }

  async run(params: Array<unknown>): Promise<MutationResultBase> {
    const result = await this.#query(params)
    return {affectedRows: result.rowCount ?? 0}
  }

  get(params: Array<unknown>): Promise<object> {
    return this.all(params).then(rows => rows[0] ?? null)
  }

  values(params: Array<unknown>): Promise<Array<Array<unknown>>> {
    return this.#query(params, 'array').then(res => res.rows)
  }

  free() {}
}

export class PgDriver implements AsyncDriver {
  parsesJson = true
  supportsTransactions = true

  constructor(
    private client: Queryable,
    private depth = 0
  ) {}

  async exec(query: string) {
    await this.client.query(query)
  }

  prepare(sql: string, options?: PrepareOptions): PreparedStatement {
    return new PreparedStatement(this.client, sql, options?.name)
  }

  async close(): Promise<void> {
    if (this.depth > 0) throw new Error('Cannot close a transaction')
    const client = this.client as PoolClient & Pool
    if (has(client, 'release', 'function')) return client.release()
    if (has(client, 'end', 'function')) return client.end()
  }

  async batch(queries: Array<BatchedQuery>): Promise<Array<Array<unknown>>> {
    return this.transaction(tx => Batch.run(tx, queries), {})
  }

  async transaction<T>(
    run: (inner: AsyncDriver) => Promise<T>,
    options: TransactionOptions['postgres']
  ): Promise<T> {
    const {client, release} = await acquireClient(this.client, this.depth)
    try {
      await client.query(this.depth > 0 ? `savepoint d${this.depth}` : 'begin')
      if (this.depth === 0) await client.query(setTransaction(options))
      const result = await run(new PgDriver(client, this.depth + 1))
      await client.query(
        this.depth > 0 ? `release savepoint d${this.depth}` : 'commit'
      )
      return result
    } catch (error) {
      try {
        await client.query(
          this.depth > 0 ? `rollback to savepoint d${this.depth}` : 'rollback'
        )
      } catch {}
      throw error
    } finally {
      release?.()
    }
  }
}

export function connect(
  client: PgCompatible,
  options?: DatabaseOptions
): AsyncDatabase<'postgres'> {
  return new AsyncDatabase(
    new PgDriver(client as Queryable),
    postgresDialect,
    options
  )
}
