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

interface SelectBase<Returning> {
  where?: HasSql<boolean>
  distinct?: boolean
  distinctOn?: Array<HasSql>
  groupBy?: Array<HasSql>
  having?: HasSql<boolean> | ((input: Returning) => HasSql<boolean>)
}

interface SelectModifiers extends QueryBase {
  orderBy?: Array<HasSql>
  limit?: Input<number>
  offset?: Input<number>
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

export type Union<Returning = SelectionInput> =
  | {union: SelectQuery<Returning>}
  | {unionAll: SelectQuery<Returning>}
  | {intersect: SelectQuery<Returning>}
  | {intersectAll: SelectQuery<Returning>}
  | {except: SelectQuery<Returning>}
  | {exceptAll: SelectQuery<Returning>}

export type UnionOp =
  | 'union'
  | 'unionAll'
  | 'intersect'
  | 'intersectAll'
  | 'except'
  | 'exceptAll'

export type CompoundSelect<Returning = SelectionInput> = [
  SelectQuery<Returning>,
  ...Array<Union<Returning>>
]

export interface UnionQuery<Returning = SelectionInput>
  extends SelectModifiers {
  select: CompoundSelect<Returning>
}

export type SelectQuery<Returning = SelectionInput> = (
  | SelectionQuery<Returning>
  | FromQuery<Returning>
) &
  SelectModifiers

export interface InsertQuery<
  Returning = SelectionInput,
  Definition extends TableDefinition = TableDefinition
> extends Partial<SelectionQuery<Returning> & SelectModifiers> {
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
> extends QueryBase {
  delete: Table<Definition>
  where?: HasSql<boolean>
  returning?: Returning
}

export interface UpdateQuery<
  Returning = SelectionInput,
  Definition extends TableDefinition = TableDefinition
> extends QueryBase {
  update: Table<Definition>
  set?: TableUpdate<Definition>
  where?: HasSql<boolean>
  returning?: Returning
}

export type Query<
  Returning extends SelectionInput = SelectionInput,
  Definition extends TableDefinition = TableDefinition
> =
  | SelectQuery<Returning>
  | FromQuery<Returning>
  | InsertQuery<Returning, Definition>
  | DeleteQuery<Returning, Definition>
  | UpdateQuery<Returning, Definition>
