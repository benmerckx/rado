import type {FieldData} from './expr/Field.ts'
import type {QueryMeta} from './MetaData.ts'
import type {Resolver} from './Resolver.ts'
import type {Selection, SelectionInput} from './Selection.ts'
import type {Sql} from './Sql.ts'
import type {TableApi, TableDefinition} from './Table.ts'

export const internalData: unique symbol = Symbol()
export const internalSql: unique symbol = Symbol()
export const internalSelection: unique symbol = Symbol()
export const internalTarget: unique symbol = Symbol()
export const internalQuery: unique symbol = Symbol()
export const internalBatch: unique symbol = Symbol()
export const internalTable: unique symbol = Symbol()
export const internalField: unique symbol = Symbol()
export const internalResolver: unique symbol = Symbol()
export const internalConstraint: unique symbol = Symbol()
export const internalInclude: unique symbol = Symbol()
export const internalEnum: unique symbol = Symbol()
export const internalCreate: unique symbol = Symbol()
export const internalDrop: unique symbol = Symbol()

export declare class HasData<Data> {
  get [internalData](): Data
}
export declare class HasSql<Value = unknown> {
  get [internalSql](): Sql<Value>
}
export declare class HasSelection<
  Input extends SelectionInput = SelectionInput
> {
  get [internalSelection](): Selection<Input>
}
export declare class HasTarget<Name extends string = string> {
  readonly [internalTarget]: Sql
}
export declare class HasQuery<Result = unknown> {
  get [internalQuery](): Sql<Result>
}
export declare class HasBatch {
  get [internalBatch](): Array<Sql>
}
export declare class HasTable<
  Definition extends TableDefinition = TableDefinition,
  Name extends string = string
> extends HasTarget<Name> {
  readonly [internalTable]: TableApi<Definition, Name>
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
export declare class HasEnum<EnumData> {
  get [internalEnum](): EnumData
}
export interface HasCreate {
  readonly [internalCreate]: Array<Sql>
}
export interface HasDrop {
  readonly [internalDrop]: Array<Sql>
}
export const hasData = <Data>(obj: object): obj is HasData<Data> =>
  internalData in obj
export const getData = <Data>(obj: HasData<Data>) => obj[internalData]
export const hasSql = <Value>(obj: object): obj is HasSql<Value> =>
  internalSql in obj
export const getSql = <Value>(obj: HasSql<Value>) => obj[internalSql]
export const hasSelection = (obj: object): obj is HasSelection =>
  internalSelection in obj
export const getSelection = <Input extends SelectionInput>(
  obj: HasSelection<Input>
) => obj[internalSelection]
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
export const hasEnum = <EnumData>(obj: object): obj is HasEnum<EnumData> =>
  internalEnum in obj
export const getEnum = <EnumData>(obj: HasEnum<EnumData>) => obj[internalEnum]
export const hasCreate = (obj: object): obj is HasCreate =>
  internalCreate in obj
export const getCreate = (obj: HasCreate) => obj[internalCreate]
export const hasDrop = (obj: object): obj is HasDrop => internalDrop in obj
export const getDrop = (obj: HasDrop) => obj[internalDrop]
