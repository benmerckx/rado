export type QueryMode = 'sync' | 'async' | undefined
export type Runtime = 'sqlite' | 'mysql' | 'postgres'
export type QueryDialect = 'universal' | Runtime

export type Deliver<Meta extends QueryMeta, Result> = Meta extends Either
  ? Result | Promise<Result>
  : Meta extends Sync
    ? Result
    : Promise<Result>

export interface QueryMeta {
  mode: QueryMode
  dialect: QueryDialect
}

export interface Sync<Dialect extends QueryDialect = QueryDialect>
  extends QueryMeta {
  mode: 'sync'
  dialect: Dialect
}

export interface Async<Dialect extends QueryDialect = QueryDialect>
  extends QueryMeta {
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
