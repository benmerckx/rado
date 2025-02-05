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

interface TopLevel {
  select?: never
  from?: never
  insert?: never
  delete?: never
  update?: never
}

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

export interface CTEBase {
  with?: Array<CTE>
  withRecursive?: Array<CTE>
}

interface SelectBase extends CTEBase, Omit<TopLevel, 'select' | 'from'> {
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

export type SelectQuery<Returning> =
  | SelectionQuery<Returning>
  | FromQuery<Returning>

export interface InsertQuery<
  Returning extends SelectionInput,
  Definition extends TableDefinition
> extends Omit<TopLevel, 'insert'> {
  insert: Table<Definition>
  values: TableInsert<Definition> | Array<TableInsert<Definition>>
  returning?: Returning
}

export interface DeleteQuery<
  Returning extends SelectionInput,
  Definition extends TableDefinition
> extends Omit<TopLevel, 'delete'> {
  delete: Table<Definition>
  where?: Sql<boolean>
  returning?: Returning
}

export interface UpdateQuery<
  Returning extends SelectionInput,
  Definition extends TableDefinition
> extends Omit<TopLevel, 'update'> {
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
