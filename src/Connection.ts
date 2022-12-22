import {Query} from './Query'
/*
export interface TransactionEnd<T> {}

export interface Transaction<T> extends Connection {
  commit(data: T): TransactionEnd<T>
  rollback(): TransactionEnd<T>
}

export interface Connection {
  transaction<T>(
    fn: (connection: Transaction<T>) => TransactionEnd<T>
  ): Promise<T>
}
*/

export type Connection = Connection.Async | Connection.Sync

export namespace Connection {
  export interface Sync {
    <T>(query: Query<T>): T
  }
  export interface Async {
    <T>(query: Query<T>): Promise<T>
  }
}
