import type {ColumnApi} from './Column.ts'
import type {QueryMode, QueryResolver} from './Query.ts'
import type {Selection} from './Selection.ts'
import type {Sql} from './Sql.ts'
import type {FieldApi, TableApi} from './Table.ts'

export namespace internal {
  export const data = Symbol.for('rado:data')
  export const expr = Symbol.for('rado:sql')
  export const selection = Symbol.for('rado:select')
  export const query = Symbol.for('rado:query')
  export const table = Symbol.for('rado:table')
  export const column = Symbol.for('rado:column')
  export const field = Symbol.for('rado:field')
  export const resolver = Symbol.for('rado:resolver')
}

export interface HasData<Data> {
  readonly [internal.data]: Data
}
export interface HasExpr {
  readonly [internal.expr]: Sql
}
export interface HasSelection {
  readonly [internal.selection]: Selection
}
export interface HasQuery {
  readonly [internal.query]: Sql
}
export interface HasTable {
  readonly [internal.table]: TableApi
}
export interface HasColumn {
  readonly [internal.column]: ColumnApi
}
export interface HasField {
  readonly [internal.field]: FieldApi
}
export interface HasResolver<Mode extends QueryMode = QueryMode> {
  readonly [internal.resolver]: QueryResolver<Mode>
}

export const hasData = <Data>(obj: object): obj is HasData<Data> =>
  internal.data in obj
export const getData = <Data>(obj: HasData<Data>) => obj[internal.data]
export const hasExpr = (obj: object): obj is HasExpr => internal.expr in obj
export const getExpr = (obj: HasExpr) => obj[internal.expr]
export const hasSelection = (obj: object): obj is HasSelection =>
  internal.selection in obj
export const getSelection = (obj: HasSelection) => obj[internal.selection]
export const hasQuery = (obj: object): obj is HasQuery => internal.query in obj
export const getQuery = (obj: HasQuery) => obj[internal.query]
export const hasTable = (obj: object): obj is HasTable => internal.table in obj
export const getTable = (obj: HasTable) => obj[internal.table]
export const hasColumn = (obj: object): obj is HasColumn =>
  internal.column in obj
export const getColumn = (obj: HasColumn) => obj[internal.column]
export const hasField = (obj: object): obj is HasField => internal.field in obj
export const getField = (obj: HasField) => obj[internal.field]
export const hasResolver = <Mode extends QueryMode>(
  obj: object
): obj is HasResolver<Mode> => internal.resolver in obj
export const getResolver = <Mode extends QueryMode>(obj: HasResolver<Mode>) =>
  obj[internal.resolver]
