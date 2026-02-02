import type {QueryMeta} from './MetaData.ts'
import type {Resolver} from './Resolver.ts'
import type {Selection} from './Selection.ts'
import type {Sql} from './Sql.ts'
import type {TableApi, TableDefinition} from './Table.ts'
import type {FieldData} from './expr/Field.ts'

export const internal: unique symbol = Symbol()

export class HasInternal<Data extends object> {
  readonly [internal]: Internal & Data
  constructor(data: Data) {
    this[internal] = data
  }
}

export interface Internal {
  readonly value?: Sql
  readonly selection?: Selection
  readonly target?: Sql
  readonly query?: Sql
  readonly batch?: Array<Sql>
  readonly table?: TableApi
  readonly field?: FieldData
  readonly resolver?: Resolver
  readonly constraint?: Sql
  readonly enum?: unknown
}

export function has(input: object): input is {readonly [internal]: Internal} {
  return internal in input
}
export function get<Input extends {[internal]?: object}>(
  input: Input
): Input[typeof internal] & Internal {
  return (has(input) ? input[internal] : {}) as any
}

export declare class HasValue<Value = unknown> {
  readonly [internal]: {value: Sql<Value>}
}
export declare class HasSelection {
  readonly [internal]: {selection: Selection}
}
export declare class HasTarget<Name extends string = string> {
  readonly [internal]: {target: Sql}
}
export declare class HasQuery<Result = unknown> extends HasInternal<{
  query: Sql<Result>
}> {}
export declare class HasBatch {
  readonly [internal]: {batch: Array<Sql>}
}
export declare class HasTable<
  Definition extends TableDefinition = TableDefinition,
  Name extends string = string
> {
  readonly [internal]: {table: TableApi<Definition, Name>}
}
export declare class HasField {
  readonly [internal]: {field: FieldData}
}
export declare class HasResolver<Meta extends QueryMeta = QueryMeta> {
  readonly [internal]: {resolver: Resolver<Meta>}
}
export declare class HasConstraint {
  readonly [internal]: {constraint: Sql}
}
export declare class HasEnum<EnumData> {
  readonly [internal]: {enum: EnumData}
}
export interface HasCreate {
  readonly [internal]: {create: Array<Sql>}
}
export interface HasDrop {
  readonly [internal]: {drop: Array<Sql>}
}
