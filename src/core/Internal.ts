import type {ColumnData} from './Column.ts'
import type {FieldData} from './Field.ts'
import type {QueryMeta} from './MetaData.ts'
import type {Resolver} from './Resolver.ts'
import type {Selection} from './Selection.ts'
import type {Sql} from './Sql.ts'
import type {TableApi, TableDefinition} from './Table.ts'

export const internalData = Symbol()
export const internalSql = Symbol()
export const internalSelection = Symbol()
export const internalQuery = Symbol()
export const internalTable = Symbol()
export const internalColumn = Symbol()
export const internalField = Symbol()
export const internalResolver = Symbol()

export declare class HasData<Data> {
  get [internalData](): Data
}
export declare class HasSql<Value = unknown> {
  get [internalSql](): Sql<Value>
}
export declare class HasSelection {
  get [internalSelection](): Selection
}
export declare class HasQuery {
  get [internalQuery](): Sql
}
export declare class HasTable<
  Definition extends TableDefinition = TableDefinition,
  Name extends string = string
> {
  get [internalTable](): TableApi<Definition, Name>
}
export declare class HasColumn {
  get [internalColumn](): ColumnData
}
export declare class HasField {
  get [internalField](): FieldData
}
export declare class HasResolver<Meta extends QueryMeta = QueryMeta> {
  get [internalResolver](): Resolver<Meta>
}

export const hasData = <Data>(obj: object): obj is HasData<Data> =>
  internalData in obj
export const getData = <Data>(obj: HasData<Data>) => obj[internalData]
export const hasSql = <Value>(obj: object): obj is HasSql<Value> =>
  internalSql in obj
export const getSql = <Value>(obj: HasSql<Value>) => obj[internalSql]
export const hasSelection = (obj: object): obj is HasSelection =>
  internalSelection in obj
export const getSelection = (obj: HasSelection) => obj[internalSelection]
export const hasQuery = (obj: object): obj is HasQuery => internalQuery in obj
export const getQuery = (obj: HasQuery) => obj[internalQuery]
export const hasTable = (obj: object): obj is HasTable => internalTable in obj
export const getTable = (obj: HasTable) => obj[internalTable]
export const hasColumn = (obj: object): obj is HasColumn =>
  internalColumn in obj
export const getColumn = (obj: HasColumn) => obj[internalColumn]
export const hasField = (obj: object): obj is HasField => internalField in obj
export const getField = (obj: HasField) => obj[internalField]
export const hasResolver = <Meta extends QueryMeta>(
  obj: object
): obj is HasResolver<Meta> => internalResolver in obj
export const getResolver = <Meta extends QueryMeta>(obj: HasResolver<Meta>) =>
  obj[internalResolver]
