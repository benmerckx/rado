import type {Builder} from './core/Builder.ts'
import type {HasTarget} from './core/Internal.ts'
import type {QueryMeta} from './core/MetaData.ts'
import type {Query} from './core/Query.ts'
import type {SelectionInput, SelectionRow} from './core/Selection.ts'
import type {Sql} from './core/Sql.ts'
import type {
  Table,
  TableDefinition,
  TableInsert,
  TableUpdate
} from './core/Table.ts'

interface TopLevel {
  select?: never
  from?: never
  insert?: never
  delete?: never
  update?: never
}

interface InnerJoin {
  innerJoin: HasTarget
  on: Sql<boolean>
}

interface LeftJoin {
  leftJoin: HasTarget
  on: Sql<boolean>
}

interface RightJoin {
  rightJoin: HasTarget
  on: Sql<boolean>
}

interface FullJoin {
  fullJoin: HasTarget
  on: Sql<boolean>
}

type Join = InnerJoin | LeftJoin | RightJoin | FullJoin

interface SelectQuery<Returning extends SelectionInput>
  extends Omit<TopLevel, 'select' | 'from'> {
  select: Returning
  from?: HasTarget | [HasTarget, ...Array<Join>]
  where?: Sql<boolean>
}

interface FromQuery<Returning extends SelectionInput>
  extends Omit<TopLevel, 'select' | 'from'> {
  select?: Returning
  from: HasTarget | [HasTarget, ...Array<Join>]
  where?: Sql<boolean>
}

interface InsertQuery<
  Returning extends SelectionInput,
  Definition extends TableDefinition
> extends Omit<TopLevel, 'insert'> {
  insert: Table<Definition>
  values: TableInsert<Definition> | Array<TableInsert<Definition>>
  returning?: Returning
}

interface DeleteQuery<
  Returning extends SelectionInput,
  Definition extends TableDefinition
> extends Omit<TopLevel, 'delete'> {
  delete: Table<Definition>
  where?: Sql<boolean>
  returning?: Returning
}

interface UpdateQuery<
  Returning extends SelectionInput,
  Definition extends TableDefinition
> extends Omit<TopLevel, 'update'> {
  update: Table<Definition>
  set: TableUpdate<Definition>
  where?: Sql<boolean>
  returning?: Returning
}

type QueryInput<
  Returning extends SelectionInput,
  Definition extends TableDefinition = TableDefinition
> =
  | SelectQuery<Returning>
  | FromQuery<Returning>
  | InsertQuery<Returning, Definition>
  | DeleteQuery<Returning, Definition>
  | UpdateQuery<Returning, Definition>

export function query<
  Returning extends SelectionInput,
  Definition extends TableDefinition,
  Meta extends QueryMeta
>(
  db: Builder<Meta>,
  query: QueryInput<Returning, Definition>
): Query<SelectionRow<Returning>, Meta> {
  if ('select' in query || 'from' in query) {
    return db.select(query.select as any).from(query.from!)
  }
  if ('insert' in query) {
    return db.insert(query.insert).values(query.values as any)
  }
  throw new Error('Invalid query')
}
