export type QueryMode = 'sync' | 'async' | undefined
export type QueryDialect = 'universal' | 'sqlite' | 'mysql' | 'postgres'

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

export interface Either extends QueryMeta {
  mode: 'sync' | 'async'
  dialect: QueryDialect
}
