import type {CTE} from '../Builder.ts'
import type {HasSql, HasTarget} from '../Internal.ts'
import type {SelectionInput} from '../Selection.ts'
import type {Sql} from '../Sql.ts'
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

export interface QueryBase {
  with?: Array<CTE>
  withRecursive?: Array<CTE>
}

interface SelectBase extends QueryBase, IsSelect {
  where?: HasSql<boolean>
  distinct?: boolean
  distinctOn?: Array<HasSql>
  groupBy?: Array<HasSql>
  orderBy?: Array<HasSql>
  limit?: Input<number>
  offset?: Input<number>
  having?: HasSql<boolean> | (() => HasSql<boolean>)
}

interface SelectionQuery<Returning> extends SelectBase {
  select: Returning
  from?: HasTarget | HasSql | [HasTarget, ...Array<Join>]
}

interface FromQuery<Returning> extends SelectBase {
  select?: Returning
  from: HasTarget | HasSql | [HasTarget, ...Array<Join>]
}

export type SelectQuery<Returning = SelectionInput> =
  | SelectionQuery<Returning>
  | FromQuery<Returning>

export interface InsertQuery<
  Returning = SelectionInput,
  Definition extends TableDefinition = TableDefinition
> extends Omit<Partial<SelectionQuery<Returning>>, 'insert'>,
    IsInsert {
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
  Returning extends SelectionInput,
  Definition extends TableDefinition
> extends IsUpdate {
  update: Table<Definition>
  set: TableUpdate<Definition>
  where?: Sql<boolean>
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

/*export function query<
  Returning extends SelectionInput,
  Definition extends TableDefinition,
  Meta extends QueryMeta
>(
  db: Builder<Meta>,
  query: QueryInput<Returning, Definition>
): Query<SelectionRow<Returning>, Meta> {
  return undefined!
}*/
