import {
  type HasQuery,
  type HasSql,
  type HasTarget,
  getData,
  getQuery,
  getSelection,
  internalData,
  internalQuery
} from './Internal.ts'
import type {IsPostgres, QueryMeta} from './MetaData.ts'
import type {QueryData, SingleQuery} from './Query.ts'
import type {SelectionInput} from './Selection.ts'
import type {Table, TableDefinition} from './Table.ts'
import {Delete, DeleteFrom} from './query/Delete.ts'
import {Insert, InsertInto} from './query/Insert.ts'
import type {
  DeleteQuery,
  FromQuery,
  InsertQuery,
  Query,
  QueryBase,
  SelectQuery,
  UpdateQuery
} from './query/Query.ts'
import type {
  SelectBase,
  UnionBase,
  WithSelection,
  WithoutSelection
} from './query/Select.ts'
import {Select} from './query/Select.ts'
import {Update, UpdateTable} from './query/Update.ts'

class BuilderBase<Meta extends QueryMeta> {
  readonly [internalData]: QueryData<Meta> & QueryBase

  constructor(data: QueryData<Meta> & QueryBase = {}) {
    this[internalData] = data
  }

  query<Returning extends SelectionInput>(
    select: SelectQuery<Returning>
  ): SingleQuery<Returning, Meta>
  query<Returning extends SelectionInput>(
    from: FromQuery<Returning>
  ): SingleQuery<Returning, Meta>
  query<Returning extends SelectionInput, Definition extends TableDefinition>(
    insert: InsertQuery<Returning, Definition>
  ): SingleQuery<Returning, Meta>
  query<Returning extends SelectionInput, Definition extends TableDefinition>(
    remove: DeleteQuery<Returning, Definition>
  ): SingleQuery<Returning, Meta>
  query<Returning extends SelectionInput, Definition extends TableDefinition>(
    update: UpdateQuery<Returning, Definition>
  ): SingleQuery<Returning, Meta>
  query<Returning extends SelectionInput, Definition extends TableDefinition>(
    query: Query<Returning, Definition>
  ): SingleQuery<Returning, Meta> {
    if ('delete' in query)
      return new Delete({...getData(this), ...(query as DeleteQuery)})
    if ('insert' in query)
      return new Insert({
        ...getData(this),
        ...(query as InsertQuery)
      })
    if ('update' in query)
      return new Update({...getData(this), ...(query as UpdateQuery)})
    return new Select({
      ...getData(this),
      ...(query as SelectQuery)
    })
  }

  select(): WithoutSelection<Meta>
  select<Input extends SelectionInput>(
    select: Input
  ): WithSelection<Input, Meta>
  select(select?: SelectionInput): any {
    return new Select<unknown, Meta>({
      ...getData(this),
      select: select!
    })
  }

  selectDistinct(): WithoutSelection<Meta>
  selectDistinct<Input extends SelectionInput>(
    selection: Input
  ): WithSelection<Input, Meta>
  selectDistinct(select?: SelectionInput): any {
    return new Select({
      ...getData(this),
      select: select!,
      distinct: true
    })
  }

  selectDistinctOn(
    this: Builder<IsPostgres>,
    columns: Array<HasSql>
  ): WithoutSelection<Meta>
  selectDistinctOn<Input extends SelectionInput>(
    this: Builder<IsPostgres>,
    columns: Array<HasSql>,
    selection: Input
  ): WithSelection<Input, Meta>
  selectDistinctOn(columns: any, select?: any): any {
    return new Select({
      ...getData(this),
      select: select!,
      distinctOn: columns
    })
  }

  update<Definition extends TableDefinition>(
    table: Table<Definition>
  ): UpdateTable<Definition, Meta> {
    return new UpdateTable<Definition, Meta>({...getData(this), update: table})
  }

  insert<Definition extends TableDefinition>(
    into: Table<Definition>
  ): InsertInto<Definition, Meta> {
    return new InsertInto<Definition, Meta>({...getData(this), insert: into})
  }

  delete<Definition extends TableDefinition>(
    from: Table<Definition>
  ): DeleteFrom<Definition, Meta> {
    return new DeleteFrom<Definition, Meta>({...getData(this), delete: from})
  }
}

export type CTE<Input = unknown> = Input & HasTarget & HasQuery

export class Builder<Meta extends QueryMeta> extends BuilderBase<Meta> {
  $with(cteName: string): {
    as<Input extends SelectionInput>(query: UnionBase<Input, Meta>): CTE<Input>
  } {
    return {
      as<Input extends SelectionInput>(
        query: SelectBase<Input, Meta>
      ): CTE<Input> {
        const fields = getSelection(query).makeVirtual(cteName)
        return Object.assign(<any>fields, {
          [internalQuery]: getQuery(query).nameSelf(cteName)
        })
      }
    }
  }

  with(...definitions: Array<CTE>): BuilderBase<Meta> {
    return new BuilderBase({
      ...getData(this),
      with: definitions
    })
  }

  withRecursive(...definitions: Array<CTE>): BuilderBase<Meta> {
    return new BuilderBase({
      ...getData(this),
      withRecursive: definitions
    })
  }
}
