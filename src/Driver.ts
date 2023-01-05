import {Cursor} from './Cursor'
import {Query, QueryType} from './Query'

export namespace Driver {
  export interface Sync {
    <T>(query: Cursor<T>): T
    (strings: TemplateStringsArray, ...values: any[]): any
  }
  export abstract class Sync extends Function {
    transactionId = 0

    constructor() {
      super()
      return new Proxy(this, {
        apply(target, thisArg, input) {
          if (input[0] instanceof Cursor) return target.executeCursor(input[0])
          throw new Error('todo')
        }
      })
    }

    executeCursor<T>(cursor: Cursor<T>): T {
      const query = cursor.query()
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

    abstract execute<T>(query: Query<T>): T

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
  export abstract class Async extends Function {
    transactionId = 0

    constructor() {
      super()
      return new Proxy(this, {
        apply(target, thisArg, input) {
          if (input[0] instanceof Cursor) return target.executeCursor(input[0])
          throw new Error('todo')
        }
      })
    }

    async executeRaw([strings, values]: [
      strings: TemplateStringsArray,
      values: Array<any>
    ]) {
      console.log(strings)
    }

    async executeCursor<T>(cursor: Cursor<T>): Promise<T> {
      const query = cursor.query()
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

    abstract execute<T>(query: Query<T>): Promise<T>
    abstract isolate(): [connection: Async, release: () => Promise<void>]

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
