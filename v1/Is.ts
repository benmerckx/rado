import type {ColumnApi} from './Column.ts'
import type {Query} from './Query.ts'
import type {Sql} from './Sql.ts'
import type {TableApi} from './Table.ts'

export namespace Is {
  export const sql = Symbol.for('rado:sql')
  export const query = Symbol.for('rado:query')
  export const table = Symbol.for('rado:table')
  export const column = Symbol.for('rado:column')
}

export interface IsSql {
  readonly [Is.sql]: Sql
}

export function isSql(value: unknown): value is IsSql {
  return Boolean(value && typeof value === 'object' && Is.sql in value)
}

export function getSql(value: Sql | IsSql) {
  return isSql(value) ? value[Is.sql] : value
}

export interface IsQuery extends IsSql {
  readonly [Is.query]: Query
}

export function isQuery(value: unknown): value is IsQuery {
  return Boolean(value && typeof value === 'object' && Is.query in value)
}

export function getQuery(value: Query | IsQuery) {
  return isQuery(value) ? value[Is.query] : value
}

export interface IsTable {
  readonly [Is.table]: TableApi
}

export function isTable(value: unknown): value is IsTable {
  return Boolean(value && typeof value === 'object' && Is.table in value)
}

export function getTable(value: IsTable) {
  return value[Is.table]
}

export interface IsColumn {
  readonly [Is.column]: ColumnApi
}

export function isColumn(value: unknown): value is IsColumn {
  return Boolean(value && typeof value === 'object' && Is.column in value)
}

export function getColumn(value: IsColumn) {
  return value[Is.column]
}
