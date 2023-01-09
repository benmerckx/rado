import {Cursor} from './Cursor'
import {Formatter} from './Formatter'
import {Query, QueryType} from './Query'
import {Schema} from './Schema'
import {Statement} from './Statement'

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

abstract class DriverBase extends Callable {
  constructor(public formatter: Formatter) {
    super((...args: Array<any>) => {
      const [input, ...rest] = args
      if (input instanceof Cursor) return this.executeQuery(input.query())
      return this.executeTemplate(undefined, input, ...rest)
    })
  }

  all(strings: TemplateStringsArray, ...params: Array<any>) {
    return this.executeTemplate('rows', strings, ...params)
  }

  get(strings: TemplateStringsArray, ...params: Array<any>) {
    return this.executeTemplate('row', strings, ...params)
  }

  executeTemplate(
    expectedReturn: Query.RawReturn,
    strings: TemplateStringsArray,
    ...params: Array<any>
  ) {
    if (strings.some(chunk => chunk.includes('?')))
      throw new TypeError('SQL injection hazard')
    return this.executeQuery(Query.Raw({strings, params, expectedReturn}))
  }

  abstract executeQuery(query: Query<any>): any
}

export namespace Driver {
  export interface Sync {
    <T>(query: Cursor<T>): T
    (strings: TemplateStringsArray, ...values: any[]): any
  }
  export abstract class Sync extends DriverBase {
    transactionId = 0

    abstract rows(stmt: Statement.Compiled): Array<object>
    abstract values(stmt: Statement.Compiled): Array<Array<any>>
    abstract execute(stmt: Statement.Compiled): void
    abstract mutate(stmt: Statement.Compiled): {rowsAffected: number}
    abstract schema(tableName: string): Schema

    executeQuery<T>(query: Query<T>): T {
      switch (query.type) {
        case QueryType.Batch:
          let result!: T
          const stmts = query.queries
          for (const query of stmts) result = this.executeQuery(query)
          return result
        default:
          const stmt = this.formatter.compile(query)
          if ('selection' in query) {
            const res = this.values(stmt).map(
              ([item]) => JSON.parse(item).result
            )
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

    all<T>(strings: TemplateStringsArray, ...params: Array<any>): Array<T> {
      return super.all(strings, ...params)
    }

    get<T>(strings: TemplateStringsArray, ...params: Array<any>): T {
      return super.get(strings, ...params)
    }

    transaction<T>(run: (query: Sync) => T): T {
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

  export interface Async {
    <T>(query: Cursor<T>): Promise<T>
    (strings: TemplateStringsArray, ...values: any[]): Promise<any>
  }
  export abstract class Async extends DriverBase {
    transactionId = 0

    abstract isolate(): [connection: Async, release: () => Promise<void>]
    abstract rows(stmt: Statement.Compiled): Promise<Array<object>>
    abstract values(stmt: Statement.Compiled): Promise<Array<Array<any>>>
    abstract execute(stmt: Statement.Compiled): Promise<void>
    abstract mutate(stmt: Statement.Compiled): Promise<{rowsAffected: number}>
    abstract schema(tableName: string): Promise<Schema>

    async executeQuery<T>(query: Query<T>): Promise<T> {
      switch (query.type) {
        case QueryType.Batch:
          let result!: T
          const stmts = query.queries
          for (const query of stmts) result = await this.executeQuery(query)
          return result
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

    all<T>(
      strings: TemplateStringsArray,
      ...params: Array<any>
    ): Promise<Array<T>> {
      return super.all(strings, ...params)
    }

    get<T>(strings: TemplateStringsArray, ...params: Array<any>): Promise<T> {
      return super.get(strings, ...params)
    }

    async transaction<T>(run: (query: Async) => T): Promise<T> {
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

  class SyncWrapper extends Async {
    lock: Promise<void> | undefined

    constructor(private sync: Sync) {
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

    async schema(tableName: string): Promise<Schema> {
      return this.sync.schema(tableName)
    }

    isolate(): [connection: Async, release: () => Promise<void>] {
      const connection = new SyncWrapper(this.sync)
      let release!: () => Promise<void>,
        trigger = new Promise<void>(resolve => {
          release = async () => resolve()
        })
      this.lock = Promise.resolve(this.lock).then(() => trigger)
      return [connection, release]
    }
  }
}
