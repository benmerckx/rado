import type {QueryMeta} from './MetaData.ts'
import type {Resolver} from './Resolver.ts'
import type {Selection} from './Selection.ts'
import type {Sql} from './Sql.ts'
import type {TableApi, TableDefinition} from './Table.ts'
import type {FieldData} from './expr/Field.ts'

export const internalData = Symbol()
export const internalSql = Symbol()
export const internalSelection = Symbol()
export const internalTarget = Symbol()
export const internalQuery = Symbol()
export const internalBatch = Symbol()
export const internalTable = Symbol()
export const internalField = Symbol()
export const internalResolver = Symbol()
export const internalConstraint = Symbol()

export declare class HasData<Data> {
  get [internalData](): Data
}
export declare class HasSql<Value = unknown> {
  get [internalSql](): Sql<Value>
}
export declare class HasSelection {
  get [internalSelection](): Selection
}
export declare class HasTarget {
  get [internalTarget](): Sql
}
export declare class HasQuery {
  get [internalQuery](): Sql
}
export declare class HasBatch {
  get [internalBatch](): Array<Sql>
}
export declare class HasTable<
  Definition extends TableDefinition = TableDefinition,
  Name extends string = string
> {
  get [internalTable](): TableApi<Definition, Name>
}
export declare class HasField {
  get [internalField](): FieldData
}
export declare class HasResolver<Meta extends QueryMeta = QueryMeta> {
  get [internalResolver](): Resolver<Meta>
}
export declare class HasConstraint {
  get [internalConstraint](): Sql
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
export const hasTarget = (obj: object): obj is HasTarget =>
  internalTarget in obj
export const getTarget = (obj: HasTarget) => obj[internalTarget]
export const hasQuery = (obj: object): obj is HasQuery => internalQuery in obj
export const getQuery = (obj: HasQuery) => obj[internalQuery]
export const hasBatch = (obj: object): obj is HasBatch => internalBatch in obj
export const getBatch = (obj: HasBatch) => obj[internalBatch]
export const hasTable = (obj: object): obj is HasTable => internalTable in obj
export const getTable = (obj: HasTable) => obj[internalTable]
export const hasField = (obj: object): obj is HasField => internalField in obj
export const getField = (obj: HasField) => obj[internalField]
export const hasResolver = <Meta extends QueryMeta>(
  obj: object
): obj is HasResolver<Meta> => internalResolver in obj
export const getResolver = <Meta extends QueryMeta>(obj: HasResolver<Meta>) =>
  obj[internalResolver]
export const hasConstraint = (obj: object): obj is HasConstraint =>
  internalConstraint in obj
export const getConstraint = (obj: HasConstraint) => obj[internalConstraint]
