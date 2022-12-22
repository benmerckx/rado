import {Cursor} from './Cursor'
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
    <T>(cursor: Cursor<T>): T
  }
  export interface Async {
    <T>(cursor: Cursor<T>): Promise<T>
  }
}
