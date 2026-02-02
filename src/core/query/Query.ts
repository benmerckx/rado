import type {HasSql, HasTarget} from '../Internal.ts'
import type {MakeNullable, SelectionInput, SelectionRow} from '../Selection.ts'
import type {Sql} from '../Sql.ts'
import type {
  Table,
  TableDefinition,
  TableFields,
  TableInsert,
  TableUpdate
} from '../Table.ts'
import type {Expand} from '../Types.ts'
import type {Input} from '../expr/Input.ts'
import type {CTE} from './CTE.ts'

interface QueryDirectives {
  select?: never
  from?: never
  delete?: never
  insert?: never
  update?: never
}

export interface InnerJoin<Target> {
  innerJoin: Target
  on: HasSql<boolean>
}

export interface LeftJoin<Target> {
  leftJoin: Target
  on: HasSql<boolean>
}

export interface RightJoin<Target> {
  rightJoin: Target
  on: HasSql<boolean>
}

export interface FullJoin<Target> {
  fullJoin: Target
  on: HasSql<boolean>
}

export interface CrossJoin<Target> {
  crossJoin: Target
  on: HasSql<boolean>
}

export type Join<Target = HasTarget | Sql> =
  | InnerJoin<Target>
  | LeftJoin<Target>
  | RightJoin<Target>
  | FullJoin<Target>
  | CrossJoin<Target>

export type JoinOp =
  | 'leftJoin'
  | 'rightJoin'
  | 'innerJoin'
  | 'fullJoin'
  | 'crossJoin'

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

export interface ResultModifiers {
  orderBy?: Array<HasSql>
  limit?: Input<number>
  offset?: Input<number>
}

export type FromGuard<Target = HasTarget | Sql> =
  | Target
  | [Target, ...Array<Join<Target>>]

interface SelectionBase<Returning = SelectionInput>
  extends SelectBase<Returning>,
    Omit<QueryDirectives, 'select' | 'from'> {
  select: Returning
  from?: FromGuard
}

export interface SelectionQuery<Returning = SelectionInput>
  extends SelectionBase<Returning>,
    QueryBase,
    ResultModifiers {}

interface FromBase<Target = FromGuard>
  extends SelectBase<undefined>,
    Omit<QueryDirectives, 'from'> {
  from: Target
}

export interface FromQuery<Target = unknown>
  extends FromBase<Target>,
    QueryBase,
    ResultModifiers {}

type FoldJoins<T extends Array<unknown>, Result> = T extends [
  infer Join,
  ...infer Joins
]
  ? FoldJoins<
      Joins,
      Join extends LeftJoin<Table<infer Definition, infer Name>>
        ? Result & MakeNullable<Record<Name, TableFields<Definition>>>
        : Join extends RightJoin<Table<infer Definition, infer Name>>
          ? MakeNullable<Result> & Record<Name, TableFields<Definition>>
          : Join extends InnerJoin<Table<infer Definition, infer Name>>
            ? Result & Record<Name, TableFields<Definition>>
            : Join extends FullJoin<Table<infer Definition, infer Name>>
              ? MakeNullable<Result> &
                  MakeNullable<Record<Name, TableFields<Definition>>>
              : Result
    >
  : Result

export type FromRow<Target> = Target extends [
  Table<infer Definition, infer Name>,
  ...infer Joins
]
  ? Joins['length'] extends 0
    ? TableFields<Definition>
    : Expand<FoldJoins<Joins, Record<Name, TableFields<Definition>>>>
  : SelectionRow<Target>

type Union<Returning = SelectionInput> =
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
  extends QueryBase,
    ResultModifiers {
  select: CompoundSelect<Returning>
}

export interface SelectQuery<Returning = SelectionInput>
  extends SelectionQuery<Returning> {} /*=
  | SelectionQuery<Returning>
  | FromQuery<Returning>*/

export interface OnConflict {
  target: HasSql | Array<HasSql>
  targetWhere?: HasSql<boolean>
}

export interface OnConflictSet<Definition extends TableDefinition> {
  set: TableUpdate<Definition>
}

export interface OnConflictUpdate<Definition extends TableDefinition>
  extends OnConflict,
    OnConflictSet<Definition> {
  where?: HasSql<boolean>
}

export type Conflict<Definition extends TableDefinition = TableDefinition> =
  | {conflictDoNothing: true | OnConflict}
  | {conflictDoUpdate: OnConflictUpdate<Definition>}
  | {duplicateKeyUpdate: OnConflictSet<Definition>}

export interface InsertQuery<
  Returning = SelectionInput,
  Definition extends TableDefinition = TableDefinition
> extends Partial<Omit<SelectionQuery<Returning>, 'insert'>>,
    QueryBase,
    ResultModifiers {
  insert: Table<Definition>
  values?: TableInsert<Definition> | Array<TableInsert<Definition>>
  returning?: Returning
  on?: Array<Conflict<Definition>>
}

export interface DeleteQuery<
  Returning = SelectionInput,
  Definition extends TableDefinition = TableDefinition
> extends QueryBase,
    ResultModifiers,
    Omit<QueryDirectives, 'delete'> {
  delete: Table<Definition>
  where?: HasSql<boolean>
  returning?: Returning
}

export interface UpdateQuery<
  Returning = SelectionInput,
  Definition extends TableDefinition = TableDefinition
> extends QueryBase,
    ResultModifiers,
    Omit<QueryDirectives, 'update'> {
  update: Table<Definition>
  set?: TableUpdate<Definition>
  where?: HasSql<boolean>
  returning?: Returning
}

export type Query =
  | FromQuery
  | SelectionQuery
  | InsertQuery
  | DeleteQuery
  | UpdateQuery

export type QueryResult<T extends Query> = T extends FromQuery<infer Target>
  ? FromRow<Target>
  : T extends InsertQuery<infer Returning>
    ? SelectionRow<Returning>
    : T extends DeleteQuery<infer Returning>
      ? SelectionRow<Returning>
      : T extends UpdateQuery<infer Returning>
        ? SelectionRow<Returning>
        : T extends SelectionQuery<infer Returning>
          ? SelectionRow<Returning>
          : never
