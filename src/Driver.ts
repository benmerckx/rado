import {Cursor} from './Cursor'
import {Query, QueryType} from './Query'

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
  constructor() {
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

    abstract execute(query: Query): any

    executeQuery<T>(query: Query<T>): T {
      switch (query.type) {
        case QueryType.Batch:
          let result!: T
          const stmts = query.queries
          for (const query of stmts) result = this.execute(query)
          return result
        default:
          return this.execute(query)
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
      this.execute(
        Query.Transaction({op: Query.TransactionOperation.Begin, id})
      )
      try {
        const res = run(this)
        this.execute(
          Query.Transaction({op: Query.TransactionOperation.Commit, id})
        )
        return res
      } catch (e) {
        this.execute(
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

    abstract execute(query: Query): Promise<any>
    abstract isolate(): [connection: Async, release: () => Promise<void>]

    async executeQuery<T>(query: Query<T>): Promise<T> {
      switch (query.type) {
        case QueryType.Batch:
          let result!: T
          const stmts = query.queries
          for (const query of stmts) result = await this.execute(query)
          return result
        default:
          return this.execute(query)
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
      await connection.execute(
        Query.Transaction({op: Query.TransactionOperation.Begin, id})
      )
      try {
        const res = await run(connection)
        await connection.execute(
          Query.Transaction({op: Query.TransactionOperation.Commit, id})
        )
        return res
      } catch (e) {
        await connection.execute(
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
      super()
    }

    async execute<T>(query: Query<T>): Promise<T> {
      await this.lock
      return this.sync.execute(query)
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
