import {Expr, ExprData} from '../define/Expr'
import {ParamData} from '../define/Param'
import {Query, QueryData, QueryType} from '../define/Query'
import {Schema, SchemaInstructions} from '../define/Schema'
import {Table} from '../define/Table'
import {Select} from '../define/query/Select'
import {Callable} from '../util/Callable'
import {Formatter} from './Formatter'
import {Statement} from './Statement'

function isTemplateStringsArray(input: any): input is TemplateStringsArray {
  return Boolean(Array.isArray(input) && (input as any).raw)
}

abstract class DriverBase extends Callable {
  constructor(public formatter: Formatter) {
    super((...args: Array<any>) => {
      const [input, ...rest] = args
      if (Query.isQuery(input) && rest.length === 0)
        return this.executeQuery(input[Query.Data])
      if (isTemplateStringsArray(input))
        return this.executeTemplate(undefined, input, ...rest)
      return this.executeQuery(
        new QueryData.Batch({
          queries: args.filter(Query.isQuery).map(arg => arg[Query.Data])
        })
      )
    })
  }

  compile<T extends Array<Expr<any>>, R>(
    create: (...params: T) => Query<R>
  ): [QueryData, Statement] {
    const {length} = create
    const paramNames = Array.from({length}, (_, i) => `p${i}`)
    const params = paramNames.map(
      name => new Expr(new ExprData.Param(new ParamData.Named(name)))
    )
    const cursor = create(...(params as any))
    const query = cursor[Query.Data]
    return [query, this.formatter.compile(query)]
  }

  executeTemplate(
    expectedReturn: QueryData.RawReturn,
    strings: TemplateStringsArray,
    ...params: Array<any>
  ) {
    return this.executeQuery(
      new QueryData.Raw({strings, params, expectedReturn})
    )
  }

  abstract executeQuery(query: QueryData): any
}

type ParamTypes<Params extends [...any[]]> = {
  [K in keyof Params]: Params[K] extends Expr<infer T> ? T : never
} & {length: Params['length']}

interface SyncDriver {
  <T>(query: Query<T>): T
  <T>(...queries: Array<Query<any>>): T
  (strings: TemplateStringsArray, ...values: any[]): any
}

abstract class SyncDriver extends DriverBase {
  transactionId: number

  constructor(formatter: Formatter) {
    super(formatter)
    this.transactionId = 0
  }

  abstract prepareStatement(
    stmt: Statement,
    discardAfter: boolean
  ): SyncPreparedStatement
  abstract schemaInstructions(tableName: string): SchemaInstructions | undefined

  prepare<T extends Array<Expr<any>>, R>(
    create: (...params: T) => Query<R>
  ): (...params: ParamTypes<T>) => R {
    const [query, compiled] = this.compile(create)
    const prepared = this.prepareStatement(compiled, false)
    return (...params: ParamTypes<T>) => {
      const namedParams = Object.fromEntries(
        params.map((value, i) => [`p${i}`, value])
      )
      return this.executeQuery(
        query,
        prepared,
        compiled.params(namedParams)
      ) as R
    }
  }

  migrateSchema(...tables: Array<Table<any>>) {
    const queries = []
    for (const current of Object.values(tables)) {
      const schema = current[Table.Data]
      const localSchema = this.schemaInstructions(schema.name)
      if (!localSchema) {
        queries.push(...Schema.create(schema).queries)
      } else {
        const changes = Schema.upgrade(this.formatter, localSchema, schema)
        if (changes.length) queries.push(...changes)
      }
    }
    return this.executeQuery(new QueryData.Batch({queries}))
  }

  executeQuery(
    query: QueryData,
    stmt?: SyncPreparedStatement,
    params?: Array<any>
  ): unknown {
    switch (query.type) {
      case QueryType.Batch:
        let result: any
        const stmts = query.queries
        if (stmts.length === 0) return undefined!
        if (stmts.length === 1) return this.executeQuery(stmts[0])
        return this.transaction(cnx => {
          for (const query of stmts) result = cnx.executeQuery(query)
          return result
        })
      default:
        const compiled = stmt ? undefined : this.formatter.compile(query)
        stmt = stmt || this.prepareStatement(compiled!, true)
        params = params || compiled!.params()
        if ('selection' in query || query.type === QueryType.Union) {
          const res = stmt
            .all<{result: string}>(params)
            .map(row => JSON.parse(row.result).result)
          if (query.singleResult) {
            const row = res[0]
            if (query.validate && row === undefined)
              throw new Error('No row found')
            return row ?? null
          }
          return res
        } else if (query.type === QueryType.Raw) {
          switch (query.expectedReturn) {
            case 'row':
              return stmt.all(params)[0]
            case 'rows':
              return stmt.all(params)
            default:
              stmt.execute(params)
              return undefined!
          }
        } else {
          return stmt.run(params)
        }
    }
  }

  *iterate<T>(cursor: Select<T>): Iterable<T> {
    const stmt = this.prepareStatement(
      this.formatter.compile(cursor[Query.Data]),
      true
    )
    for (const row of stmt.iterate<{result: string}>()) {
      yield JSON.parse(row.result).result
    }
  }

  transaction<T>(run: (query: SyncDriver) => T): T {
    const id = `t${this.transactionId++}`
    this.executeQuery(
      new QueryData.Transaction({op: QueryData.TransactionOperation.Begin, id})
    )
    try {
      const res = run(this)
      this.executeQuery(
        new QueryData.Transaction({
          op: QueryData.TransactionOperation.Commit,
          id
        })
      )
      return res
    } catch (e) {
      this.executeQuery(
        new QueryData.Transaction({
          op: QueryData.TransactionOperation.Rollback,
          id
        })
      )
      throw e
    }
  }

  toAsync() {
    return new SyncWrapper(this)
  }
}

interface SyncPreparedStatement {
  run(params?: Array<any>): {rowsAffected: number}
  iterate<T>(params?: Array<any>): Iterable<T>
  all<T>(params?: Array<any>): Array<T>
  get<T>(params?: Array<any>): T
  execute(params?: Array<any>): void
}

interface AsyncDriver {
  <T>(query: Query<T>): Promise<T>
  <T>(...queries: Array<Query<any>>): Promise<T>
  (strings: TemplateStringsArray, ...values: any[]): Promise<any>
}

abstract class AsyncDriver extends DriverBase {
  transactionId: number

  constructor(formatter: Formatter) {
    super(formatter)
    this.transactionId = 0
  }

  abstract isolate(): [connection: AsyncDriver, release: () => Promise<void>]
  abstract prepareStatement(
    stmt: Statement,
    discardAfter: boolean
  ): AsyncPreparedStatement
  abstract schemaInstructions(
    tableName: string
  ): Promise<SchemaInstructions | undefined>

  prepare<T extends Array<Expr<any>>, R>(
    create: (...params: T) => Query<R>
  ): (...params: ParamTypes<T>) => Promise<R> {
    const [query, compiled] = this.compile(create)
    const prepared = this.prepareStatement(compiled, false)
    return (...params: ParamTypes<T>) => {
      const namedParams = Object.fromEntries(
        params.map((value, i) => [`p${i}`, value])
      )
      return this.executeQuery(
        query,
        prepared,
        compiled.params(namedParams)
      ) as Promise<R>
    }
  }

  async migrateSchema(...tables: Array<Table<any>>) {
    const queries = []
    for (const current of Object.values(tables)) {
      const schema = current[Table.Data]
      const localSchema = await this.schemaInstructions(schema.name)
      if (!localSchema) {
        queries.push(...Schema.create(schema).queries)
      } else {
        const changes = Schema.upgrade(this.formatter, localSchema, schema)
        if (changes.length) queries.push(...changes)
      }
    }
    return this.executeQuery(new QueryData.Batch({queries}))
  }

  async executeQuery(
    query: QueryData,
    stmt?: AsyncPreparedStatement,
    params?: Array<any>
  ): Promise<unknown> {
    switch (query.type) {
      case QueryType.Batch:
        let result!: any
        const stmts = query.queries
        if (stmts.length === 0) return undefined!
        if (stmts.length === 1) return this.executeQuery(stmts[0])
        return this.transaction(async cnx => {
          for (const query of stmts) result = await cnx.executeQuery(query)
          return result
        })
      default:
        const compiled = stmt ? undefined : this.formatter.compile(query)
        stmt = stmt || this.prepareStatement(compiled!, true)
        params = params || compiled!.params()
        if ('selection' in query || query.type === QueryType.Union) {
          const res = (await stmt.all<{result: string}>(params)).map(
            item => JSON.parse(item.result).result
          )
          if (query.singleResult) {
            const row = res[0]
            if (query.validate && row === undefined)
              throw new Error('No row found')
            return row ?? null
          }
          return res
        } else if (query.type === QueryType.Raw) {
          switch (query.expectedReturn) {
            case 'row':
              return (await stmt.all(params))[0]
            case 'rows':
              return await stmt.all(params)
            default:
              await stmt.execute(params)
              return undefined!
          }
        } else {
          return await stmt.run(params)
        }
    }
  }

  async *iterate<T>(cursor: Select<T>): AsyncIterable<T> {
    const stmt = this.prepareStatement(
      this.formatter.compile(cursor[Query.Data]),
      true
    )
    for await (const row of stmt.iterate<{result: string}>()) {
      yield JSON.parse(row.result).result
    }
  }

  async transaction<T>(run: (query: AsyncDriver) => T): Promise<T> {
    const id = `t${this.transactionId++}`
    const [connection, release] = this.isolate()
    await connection.executeQuery(
      new QueryData.Transaction({op: QueryData.TransactionOperation.Begin, id})
    )
    try {
      const res = await run(connection)
      await connection.executeQuery(
        new QueryData.Transaction({
          op: QueryData.TransactionOperation.Commit,
          id
        })
      )
      return res
    } catch (e) {
      await connection.executeQuery(
        new QueryData.Transaction({
          op: QueryData.TransactionOperation.Rollback,
          id
        })
      )
      throw e
    } finally {
      await release()
    }
  }
}

class SyncPreparedStatementWrapper implements AsyncPreparedStatement {
  constructor(private stmt: SyncPreparedStatement) {}

  async *iterate<T>(params?: Array<any>): AsyncIterable<T> {
    for (const row of this.stmt.iterate<T>(params)) yield row
  }

  async run(params?: Array<any>): Promise<{rowsAffected: number}> {
    return this.stmt.run(params)
  }

  async all<T>(params?: Array<any>): Promise<Array<T>> {
    return this.stmt.all(params)
  }

  async get<T>(params?: Array<any>): Promise<T> {
    return this.stmt.get(params)
  }

  async execute(params?: Array<any>): Promise<void> {
    return this.stmt.execute(params)
  }
}

class SyncWrapper extends AsyncDriver {
  lock: Promise<void> | undefined

  constructor(private sync: SyncDriver) {
    super(sync.formatter)
  }

  async executeQuery(
    query: QueryData,
    stmt?: AsyncPreparedStatement,
    params?: Array<any>
  ): Promise<unknown> {
    await this.lock
    return super.executeQuery(query, stmt, params)
  }

  prepareStatement(
    stmt: Statement,
    discardAfter: boolean
  ): AsyncPreparedStatement {
    return new SyncPreparedStatementWrapper(
      this.sync.prepareStatement(stmt, discardAfter)
    )
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

interface AsyncPreparedStatement {
  run(params?: Array<any>): Promise<{rowsAffected: number}>
  iterate<T>(params?: Array<any>): AsyncIterable<T>
  all<T>(params?: Array<any>): Promise<Array<T>>
  get<T>(params?: Array<any>): Promise<T>
  execute(params?: Array<any>): Promise<void>
}

export type Driver = SyncDriver | AsyncDriver

export namespace Driver {
  export type Sync = SyncDriver
  export const Sync = SyncDriver
  export namespace Sync {
    export type PreparedStatement = SyncPreparedStatement
  }
  export type Async = AsyncDriver
  export const Async = AsyncDriver
  export namespace Async {
    export type PreparedStatement = AsyncPreparedStatement
  }
}
