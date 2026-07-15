import {Builder} from './Builder.ts'
import {Column} from './Column.ts'
import {Input} from './expr/Input.ts'
import {getData, HasSql, HasTable, HasTarget} from './Internal.ts'
import {Deliver, QueryMeta} from './MetaData.ts'
import {SingleQuery} from './Queries.ts'
import {
  FromGuard,
  FromQuery,
  FromRow,
  Query,
  SelectionBase,
  SelectionQuery
} from './query/Query.ts'
import {Select, SelectBase, SelectFirst, WithSelection} from './query/Select.ts'
import {SelectionInput, SelectionRow} from './Selection.ts'
import {Table, TableDefinition, TableFields, TableRow} from './Table.ts'

type ORMSelectionQuery<Input extends SelectionInput = SelectionInput> = Omit<
  SelectionQuery<Input>,
  'from' | 'select'
> & {
  select?: Input
}

export abstract class ORM<Meta extends QueryMeta> extends Builder<Meta> {
  abstract transaction<T>(run: (tx: ORM<Meta>) => T): T

  find<Returning extends SelectionInput>(
    table: HasTarget,
    query: ORMSelectionQuery<Returning> & {select: Returning}
  ): SelectBase<Returning, Meta>
  find<Target extends HasTarget & SelectionInput>(
    table: Target,
    query?: ORMSelectionQuery<Target>
  ): SelectBase<Target, Meta>
  find(
    table: HasTarget & SelectionInput,
    query?: ORMSelectionQuery
  ): SelectBase<SelectionInput, Meta> {
    return new SelectBase({
      ...getData(this),
      ...query,
      from: table,
      select: query?.select ?? table
    })
  }

  first<Returning extends SelectionInput>(
    table: HasTarget,
    query: ORMSelectionQuery<Returning> & {select: Returning}
  ): SelectFirst<Returning, Meta>
  first<Target extends HasTarget & SelectionInput>(
    table: Target,
    query?: ORMSelectionQuery<Target>
  ): SelectFirst<Target, Meta>
  first(
    table: HasTarget & SelectionInput,
    query?: ORMSelectionQuery
  ): SelectFirst<SelectionInput, Meta> {
    return new SelectFirst({
      ...getData(this),
      ...query,
      from: table,
      select: query?.select ?? table
    })
  }

  count(query: Omit<SelectionQuery, 'select'>): Deliver<Meta, number> {
    throw 'todo'
  }

  save<Definition extends TableDefinition>(
    table: Table<Definition>,
    data: Record<string, unknown>
  ): Deliver<Meta, TableRow<Definition>> {
    throw 'todo'
  }
}

interface RelationOptions {
  from: HasSql
  to: HasSql
}

export function one<Definition extends TableDefinition>(
  target: Table<Definition>,
  options: RelationOptions
) {
  return new OneRelation(target, options)
}

export function many<Definition extends TableDefinition>(
  target: Table<Definition>,
  options: RelationOptions
) {
  return new ManyRelation(target, options)
}

// oxlint-disable-next-line typescript/no-unsafe-declaration-merging
interface ManyRelation<To, Meta extends QueryMeta> {
  (): SelectBase<To, Meta>
}

class ManyRelation<To, Meta extends QueryMeta> extends SelectBase<To, Meta> {
  constructor(target: HasTable, options: RelationOptions) {
    super({select: target})
    return Object.assign((): SelectBase<To, Meta> => {
      return new SelectBase(getData(this))
    }, this)
  }

  select<Input extends SelectionInput>(select: Input): Select<Input, Meta> {
    return new Select<Input, Meta>({
      ...getData(this),
      select
    })
  }
}

// oxlint-disable-next-line typescript/no-unsafe-declaration-merging
interface OneRelation<To, Meta extends QueryMeta> {
  (): SelectFirst<To, Meta>
}

class OneRelation<To, Meta extends QueryMeta> extends SelectBase<To, Meta> {
  constructor(target: HasTable, options: RelationOptions) {
    super({select: target})
    return Object.assign((): SelectFirst<To, Meta> => {
      return new SelectFirst(getData(this))
    }, this)
  }

  select<Input extends SelectionInput>(select: Input): Select<Input, Meta> {
    return new Select<Input, Meta>({
      ...getData(this),
      select
    })
  }
}
