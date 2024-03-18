import type {ColumnApi} from './Column.ts'
import {ExprApi} from './Expr.ts'
import {Selection} from './Selection.ts'
import type {Sql} from './Sql.ts'
import type {TableApi} from './Table.ts'

export namespace meta {
  export const expr = Symbol.for('rado:sql')
  export const selection = Symbol.for('rado:select')
  export const query = Symbol.for('rado:query')
  export const table = Symbol.for('rado:table')
  export const column = Symbol.for('rado:column')
}

export interface ExprToSqlOptions {
  includeTableName: boolean
}
export interface HasExpr {
  readonly [meta.expr]: ExprApi
}
export interface HasSelection {
  readonly [meta.selection]: Selection
}
export interface HasQuery {
  readonly [meta.query]: Sql
}
export interface HasTable {
  readonly [meta.table]: TableApi
}
export interface HasColumn {
  readonly [meta.column]: ColumnApi
}

export const hasExpr = (obj: object): obj is HasExpr => meta.expr in obj
export const getExpr = (obj: HasExpr) => obj[meta.expr]
export const hasSelection = (obj: object): obj is HasSelection =>
  meta.selection in obj
export const getSelection = (obj: HasSelection) => obj[meta.selection]
export const hasQuery = (obj: object): obj is HasQuery => meta.query in obj
export const getQuery = (obj: HasQuery) => obj[meta.query]
export const hasTable = (obj: object): obj is HasTable => meta.table in obj
export const getTable = (obj: HasTable) => obj[meta.table]
export const hasColumn = (obj: object): obj is HasColumn => meta.column in obj
export const getColumn = (obj: HasColumn) => obj[meta.column]
