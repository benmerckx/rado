import type {ColumnApi} from './Column.ts'
import type {QueryMode, QueryResolver} from './Query.ts'
import type {Selection} from './Selection.ts'
import type {Sql} from './Sql.ts'
import type {FieldApi, TableApi, TableDefinition} from './Table.ts'

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

export declare class HasData<Data> {
  get [internal.data](): Data
}
export declare class HasExpr {
  get [internal.expr](): Sql
}
export declare class HasSelection {
  get [internal.selection](): Selection
}
export declare class HasQuery {
  get [internal.query](): Sql
}
export declare class HasTable<
  Definition extends TableDefinition = TableDefinition,
  Name extends string = string
> {
  get [internal.table](): TableApi<Definition, Name>
}
export declare class HasColumn {
  get [internal.column](): ColumnApi
}
export declare class HasField {
  get [internal.field](): FieldApi
}
export declare class HasResolver<Mode extends QueryMode = QueryMode> {
  get [internal.resolver](): QueryResolver<Mode>
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
