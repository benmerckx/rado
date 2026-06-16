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
  SelectionQuery
} from './query/Query.ts'
import {Select, SelectBase, SelectFirst, WithSelection} from './query/Select.ts'
import {SelectionInput, SelectionRow} from './Selection.ts'
import {Table, TableDefinition, TableRow} from './Table.ts'

export abstract class ORM<Meta extends QueryMeta> extends Builder<Meta> {
  abstract transaction<T>(run: (tx: ORM<Meta>) => T): T

  find<const Returning extends SelectionInput>(
    query: SelectionQuery<Returning>
  ): SingleQuery<Returning, Meta>
  find<const From extends FromGuard>(
    from: FromQuery<From>
  ): SingleQuery<FromRow<From>, Meta>
  find(query: Query): SingleQuery<unknown, Meta> {
    throw 'todo'
  }

  first<Returning extends SelectionInput>(
    query: SelectionQuery<Returning>
  ): SelectFirst<Returning, Meta>
  first<const From extends FromGuard>(
    from: FromQuery<From>
  ): SelectFirst<FromRow<From>, Meta>
  first(query: Query): SelectFirst<unknown, Meta> {
    throw 'todo'
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
  return new Relation<Definition, QueryMeta>(target, options)
}

export function many<Definition extends TableDefinition>(
  target: Table<Definition>,
  options: RelationOptions
) {
  return new Relation<Definition, QueryMeta>(target, options)
}

class Relation<Input, Meta extends QueryMeta> extends SelectBase<Input, Meta> {
  constructor(target: HasTable, options: RelationOptions) {
    super({
      select: target
    })
  }

  select<Input extends SelectionInput>(select: Input): Select<Input, Meta> {
    return new Select<Input, Meta>({
      ...getData(this),
      select
    })
  }
}
