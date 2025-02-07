import type {CTE} from '../Builder.ts'
import type {HasSql, HasTarget} from '../Internal.ts'
import type {SelectionInput} from '../Selection.ts'
import type {
  Table,
  TableDefinition,
  TableInsert,
  TableUpdate
} from '../Table.ts'
import type {Input} from '../expr/Input.ts'
import type {OnConflict, OnConflictSet, OnConflictUpdate} from './Insert.ts'

interface TopLevel {
  select?: never
  from?: never
  insert?: never
  delete?: never
  update?: never
}
type IsSelect = Omit<TopLevel, 'select' | 'from'>
type IsInsert = Omit<TopLevel, 'insert' | 'from' | 'select'>
type IsDelete = Omit<TopLevel, 'delete'>
type IsUpdate = Omit<TopLevel, 'update'>

export interface InnerJoin {
  innerJoin: HasTarget
  on: HasSql<boolean>
}

export interface LeftJoin {
  leftJoin: HasTarget
  on: HasSql<boolean>
}

export interface RightJoin {
  rightJoin: HasTarget
  on: HasSql<boolean>
}

export interface FullJoin {
  fullJoin: HasTarget
  on: HasSql<boolean>
}

export type Join = InnerJoin | LeftJoin | RightJoin | FullJoin
export type JoinOp = 'leftJoin' | 'rightJoin' | 'innerJoin' | 'fullJoin'

export interface QueryBase {
  with?: Array<CTE>
  withRecursive?: Array<CTE>
}

interface SelectBase<Returning> extends QueryBase {
  where?: HasSql<boolean>
  distinct?: boolean
  distinctOn?: Array<HasSql>
  groupBy?: Array<HasSql>
  orderBy?: Array<HasSql>
  limit?: Input<number>
  offset?: Input<number>
  having?: HasSql<boolean> | ((input: Returning) => HasSql<boolean>)
}

export interface SelectionQuery<Returning = SelectionInput>
  extends SelectBase<Returning> {
  select: Returning
  from?: HasTarget | HasSql | [HasTarget, ...Array<Join>]
}

export interface FromQuery<Returning = SelectionInput>
  extends SelectBase<Returning> {
  select?: Returning
  from: HasTarget | HasSql | [HasTarget, ...Array<Join>]
}

export type SelectQuery<Returning = SelectionInput> =
  | SelectionQuery<Returning>
  | FromQuery<Returning>

export interface InsertQuery<
  Returning = SelectionInput,
  Definition extends TableDefinition = TableDefinition
> extends Partial<SelectionQuery<Returning>> {
  insert: Table<Definition>
  values?: TableInsert<Definition> | Array<TableInsert<Definition>>
  returning?: Returning
  onConflict?: OnConflictUpdate<Definition>
  onDuplicateKeyUpdate?: OnConflictSet<Definition>
  onConflictDoNothing?: true | OnConflict
}

export interface DeleteQuery<
  Returning = SelectionInput,
  Definition extends TableDefinition = TableDefinition
> extends QueryBase,
    IsDelete {
  delete: Table<Definition>
  where?: HasSql<boolean>
  returning?: Returning
}

export interface UpdateQuery<
  Returning = SelectionInput,
  Definition extends TableDefinition = TableDefinition
> extends QueryBase,
    IsUpdate {
  update: Table<Definition>
  set: TableUpdate<Definition>
  where?: HasSql<boolean>
  returning?: Returning
}

export type Query<
  Returning extends SelectionInput = SelectionInput,
  Definition extends TableDefinition = TableDefinition
> =
  | (SelectQuery<Returning> & IsSelect)
  | (FromQuery<Returning> & IsSelect)
  | (InsertQuery<Returning, Definition> & IsInsert)
  | (DeleteQuery<Returning, Definition> & IsDelete)
  | (UpdateQuery<Returning, Definition> & IsUpdate)
