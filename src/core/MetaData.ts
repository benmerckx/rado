export type QueryMode = 'sync' | 'async' | undefined
export type Runtime = 'sqlite' | 'mysql' | 'postgres'
export type QueryDialect = 'universal' | Runtime

export type Deliver<Meta extends QueryMeta, Result> = Meta extends Sync
  ? Result
  : Meta extends Async
    ? Promise<Result>
    : Result | Promise<Result>

export interface QueryMeta {
  mode: QueryMode
  dialect: QueryDialect
}

export interface Sync<
  Dialect extends QueryDialect = QueryDialect
> extends QueryMeta {
  mode: 'sync'
  dialect: Dialect
}

export interface Async<
  Dialect extends QueryDialect = QueryDialect
> extends QueryMeta {
  mode: 'async'
  dialect: Dialect
}

export interface IsPostgres extends QueryMeta {
  dialect: 'postgres'
}

export interface IsMysql extends QueryMeta {
  dialect: 'mysql'
}

export interface IsSqlite extends QueryMeta {
  dialect: 'sqlite'
}

export interface Either extends QueryMeta {
  mode: 'sync' | 'async'
  dialect: QueryDialect
}

export interface MutationResultBase {
  affectedRows: number
  changedRows?: number
  insertId?: number | bigint
}

export type MysqlMutationResult = {
  affectedRows: number
  changedRows: number
  insertId: number
}

export type PostgresMutationResult = {
  affectedRows: number
  changedRows?: never
  insertId?: never
}

export type SqliteMutationResult = {
  affectedRows: number
  changedRows?: never
  insertId?: number | bigint
}

export type MutationResult<Meta extends QueryMeta> = Meta extends IsMysql
  ? MysqlMutationResult
  : Meta extends IsPostgres
    ? PostgresMutationResult
    : Meta extends IsSqlite
      ? SqliteMutationResult
      : MutationResultBase
