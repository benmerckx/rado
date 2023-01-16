import {Cursor} from './Cursor'
import {Formatter} from './Formatter'
import {Query, QueryType} from './Query'
import {Schema, SchemaInstructions} from './Schema'
import {Statement} from './Statement'
import {Table} from './Table'

class Callable extends Function {
  constructor(fn: Function) {
    super()
    return new Proxy(this, {
      apply(_, thisArg, input) {
        return fn.apply(thisArg, input)
      }
    })
  }
}

function isTemplateStringsArray(input: any): input is TemplateStringsArray {
  return Boolean(Array.isArray(input) && (input as any).raw)
}

abstract class DriverBase extends Callable {
  constructor(public formatter: Formatter) {
    super((...args: Array<any>) => {
      const [input, ...rest] = args
      if (input instanceof Cursor && rest.length === 0)
        return this.executeQuery(input.query())
      if (isTemplateStringsArray(input))
        return this.executeTemplate(undefined, input, ...rest)
      return this.executeQuery(
        Query.Batch({
          queries: args
            .filter(arg => arg instanceof Cursor)
            .map(arg => arg.query())
        })
      )
    })
  }

  all(...args: Array<any>) {
    const [input, ...rest] = args
    if (input instanceof Cursor.SelectSingle)
      return this.executeQuery(input.all().query())
    if (input instanceof Cursor) return this.executeQuery(input.query())
    return this.executeTemplate('rows', input, ...rest)
  }

  get(...args: Array<any>) {
    const [input, ...rest] = args
    if (input instanceof Cursor.SelectMultiple)
      return this.executeQuery(input.first().query())
    if (input instanceof Cursor) return this.executeQuery(input.query())
    return this.executeTemplate('row', input, ...rest)
  }

  sql(strings: TemplateStringsArray, ...params: Array<any>) {
    return new Cursor(Query.Raw({strings, params}))
  }

  executeTemplate(
    expectedReturn: Query.RawReturn,
    strings: TemplateStringsArray,
    ...params: Array<any>
  ) {
    return this.executeQuery(Query.Raw({strings, params, expectedReturn}))
  }

  abstract executeQuery(query: Query<any>): any
}

interface SyncDriver {
  <T>(query: Cursor<T>): T
  <T>(...queries: Array<Cursor<any>>): T
  (strings: TemplateStringsArray, ...values: any[]): any
}

abstract class SyncDriver extends DriverBase {
  transactionId = 0

  abstract rows(stmt: Statement.Compiled): Array<object>
  abstract values(stmt: Statement.Compiled): Array<Array<any>>
  abstract execute(stmt: Statement.Compiled): void
  abstract mutate(stmt: Statement.Compiled): {rowsAffected: number}
  abstract schemaInstructions(tableName: string): SchemaInstructions | undefined

  migrateSchema(...tables: Array<Table<any>>) {
    const queries = []
    for (const table of Object.values(tables)) {
      const schema = table.schema()
      const localSchema = this.schemaInstructions(schema.name)
      if (!localSchema) {
        queries.push(...Schema.create(schema).queries)
      } else {
        const changes = Schema.upgrade(this.formatter, localSchema, schema)
        if (changes.length) queries.push(...changes)
      }
    }
    return this.executeQuery(Query.Batch({queries}))
  }

  executeQuery<T>(query: Query<T>): T {
    switch (query.type) {
      case QueryType.Batch:
        let result!: T
        const stmts = query.queries
        if (stmts.length === 0) return undefined!
        if (stmts.length === 1) return this.executeQuery(stmts[0])
        return this.transaction(cnx => {
          for (const query of stmts) result = cnx.executeQuery(query)
          return result
        })
      default:
        const stmt = this.formatter.compile(query)
        if ('selection' in query) {
          const res = this.values(stmt).map(([item]) => JSON.parse(item).result)
          if (query.singleResult) return res[0] as T
          return res as T
        } else if (query.type === QueryType.Raw) {
          switch (query.expectedReturn) {
            case 'row':
              return this.rows(stmt)[0] as T
            case 'rows':
              return this.rows(stmt) as T
            default:
              this.execute(stmt)
              return undefined!
          }
        } else {
          return this.mutate(stmt) as T
        }
    }
  }

  all<T>(cursor: Cursor.SelectSingle<T>): Array<T>
  all<T>(cursor: Cursor<T>): T
  all<T>(strings: TemplateStringsArray, ...params: Array<any>): Array<T>
  all<T>(...args: Array<any>): Array<T> {
    return super.all(...args)
  }

  get<T>(cursor: Cursor.SelectMultiple<T>): T | null
  get<T>(cursor: Cursor<T>): T
  get<T>(strings: TemplateStringsArray, ...params: Array<any>): T
  get<T>(...args: Array<any>): T {
    return super.get(...args)
  }

  transaction<T>(run: (query: SyncDriver) => T): T {
    const id = `t${this.transactionId++}`
    this.executeQuery(
      Query.Transaction({op: Query.TransactionOperation.Begin, id})
    )
    try {
      const res = run(this)
      this.executeQuery(
        Query.Transaction({op: Query.TransactionOperation.Commit, id})
      )
      return res
    } catch (e) {
      this.executeQuery(
        Query.Transaction({op: Query.TransactionOperation.Rollback, id})
      )
      throw e
    }
  }

  toAsync() {
    return new SyncWrapper(this)
  }
}

interface AsyncDriver {
  <T>(query: Cursor<T>): Promise<T>
  <T>(...queries: Array<Cursor<any>>): Promise<T>
  (strings: TemplateStringsArray, ...values: any[]): Promise<any>
}

abstract class AsyncDriver extends DriverBase {
  transactionId = 0

  abstract isolate(): [connection: AsyncDriver, release: () => Promise<void>]
  abstract rows(stmt: Statement.Compiled): Promise<Array<object>>
  abstract values(stmt: Statement.Compiled): Promise<Array<Array<any>>>
  abstract execute(stmt: Statement.Compiled): Promise<void>
  abstract mutate(stmt: Statement.Compiled): Promise<{rowsAffected: number}>
  abstract schemaInstructions(
    tableName: string
  ): Promise<SchemaInstructions | undefined>

  async migrateSchema(...tables: Array<Table<any>>) {
    const queries = []
    for (const table of Object.values(tables)) {
      const schema = table.schema()
      const localSchema = await this.schemaInstructions(schema.name)
      if (!localSchema) {
        queries.push(...Schema.create(schema).queries)
      } else {
        const changes = Schema.upgrade(this.formatter, localSchema, schema)
        if (changes.length) queries.push(...changes)
      }
    }
    return this.executeQuery(Query.Batch({queries}))
  }

  async executeQuery<T>(query: Query<T>): Promise<T> {
    switch (query.type) {
      case QueryType.Batch:
        let result!: T
        const stmts = query.queries
        if (stmts.length === 0) return undefined!
        if (stmts.length === 1) return this.executeQuery(stmts[0])
        return this.transaction(async cnx => {
          for (const query of stmts) result = await cnx.executeQuery(query)
          return result
        })
      default:
        const stmt = this.formatter.compile(query)
        if ('selection' in query) {
          const res = (await this.values(stmt)).map(
            ([item]) => JSON.parse(item).result
          )
          if (query.singleResult) return res[0] as T
          return res as T
        } else if (query.type === QueryType.Raw) {
          switch (query.expectedReturn) {
            case 'row':
              return (await this.rows(stmt))[0] as T
            case 'rows':
              return (await this.rows(stmt)) as T
            default:
              await this.execute(stmt)
              return undefined!
          }
        } else {
          return (await this.mutate(stmt)) as T
        }
    }
  }

  all<T>(cursor: Cursor.SelectSingle<T>): Promise<Array<T>>
  all<T>(cursor: Cursor<T>): Promise<T>
  all<T>(
    strings: TemplateStringsArray,
    ...params: Array<any>
  ): Promise<Array<T>>
  all<T>(...args: Array<any>): Promise<Array<T>> {
    return super.all(...args)
  }

  get<T>(cursor: Cursor.SelectMultiple<T>): Promise<T | null>
  get<T>(cursor: Cursor<T>): Promise<T>
  get<T>(strings: TemplateStringsArray, ...params: Array<any>): Promise<T>
  get<T>(...args: Array<any>): Promise<T> {
    return super.get(...args)
  }

  async transaction<T>(run: (query: AsyncDriver) => T): Promise<T> {
    const id = `t${this.transactionId++}`
    const [connection, release] = this.isolate()
    await connection.executeQuery(
      Query.Transaction({op: Query.TransactionOperation.Begin, id})
    )
    try {
      const res = await run(connection)
      await connection.executeQuery(
        Query.Transaction({op: Query.TransactionOperation.Commit, id})
      )
      return res
    } catch (e) {
      await connection.executeQuery(
        Query.Transaction({op: Query.TransactionOperation.Rollback, id})
      )
      throw e
    } finally {
      await release()
    }
  }
}

class SyncWrapper extends AsyncDriver {
  lock: Promise<void> | undefined

  constructor(private sync: SyncDriver) {
    super(sync.formatter)
  }

  async executeQuery<T>(query: Query<T>): Promise<T> {
    await this.lock
    return super.executeQuery(query)
  }

  async rows(stmt: Statement.Compiled): Promise<Array<object>> {
    return this.sync.rows(stmt)
  }

  async values(stmt: Statement.Compiled): Promise<Array<Array<any>>> {
    return this.sync.values(stmt)
  }

  async execute(stmt: Statement.Compiled): Promise<void> {
    return this.sync.execute(stmt)
  }

  async mutate(stmt: Statement.Compiled): Promise<{rowsAffected: number}> {
    return this.sync.mutate(stmt)
  }

  async schemaInstructions(
    tableName: string
  ): Promise<SchemaInstructions | undefined> {
    return this.sync.schemaInstructions(tableName)
  }

  isolate(): [connection: AsyncDriver, release: () => Promise<void>] {
    const connection = new SyncWrapper(this.sync)
    let release!: () => Promise<void>,
      trigger = new Promise<void>(resolve => {
        release = async () => resolve()
      })
    this.lock = Promise.resolve(this.lock).then(() => trigger)
    return [connection, release]
  }
}

export namespace Driver {
  export type Sync = SyncDriver
  export const Sync = SyncDriver
  export type Async = AsyncDriver
  export const Async = AsyncDriver
}
