import {
  type HasQuery,
  type HasValue,
  get,
  internal
} from './Internal.ts'
import type {IsPostgres, QueryMeta} from './MetaData.ts'
import type {QueryData, SingleQuery} from './Queries.ts'
import type {SelectionInput, SelectionRow} from './Selection.ts'
import type {Sql} from './Sql.ts'
import type {Table, TableDefinition} from './Table.ts'
import {virtualTarget} from './Virtual.ts'
import type {CTE} from './query/CTE.ts'
import {Delete, DeleteFrom} from './query/Delete.ts'
import {Insert, InsertInto} from './query/Insert.ts'
import type {
  DeleteQuery,
  FromGuard,
  FromQuery,
  FromRow,
  InsertQuery,
  Query,
  QueryBase,
  SelectQuery,
  SelectionQuery,
  UpdateQuery
} from './query/Query.ts'
import type {
  UnionBase,
  WithSelection,
  WithoutSelection
} from './query/Select.ts'
import {Select} from './query/Select.ts'
import {Update, UpdateTable} from './query/Update.ts'

class BuilderBase<Meta extends QueryMeta> {
  readonly [internal]: QueryData & QueryBase

  constructor(data: QueryData & QueryBase = {}) {
    this[internal] = data
  }

  $query<Returning extends SelectionInput>(
    select: SelectionQuery<Returning>
  ): SingleQuery<SelectionRow<Returning>, Meta>
  $query<const From extends FromGuard>(
    from: FromQuery<From>
  ): SingleQuery<FromRow<From>, Meta>
  $query<Returning extends SelectionInput, Definition extends TableDefinition>(
    insert: InsertQuery<Returning, Definition>
  ): SingleQuery<SelectionRow<Returning>, Meta>
  $query<Returning extends SelectionInput, Definition extends TableDefinition>(
    remove: DeleteQuery<Returning, Definition>
  ): SingleQuery<SelectionRow<Returning>, Meta>
  $query<Returning extends SelectionInput, Definition extends TableDefinition>(
    update: UpdateQuery<Returning, Definition>
  ): SingleQuery<SelectionRow<Returning>, Meta>
  $query(query: Query): SingleQuery<unknown, Meta> {
    const data = {...get(this), ...query}
    if ('delete' in query) return new Delete(data as DeleteQuery)
    if ('insert' in query) return new Insert(data as InsertQuery)
    if ('update' in query) return new Update(data as UpdateQuery)
    return new Select(data as SelectQuery)
  }

  select(): WithoutSelection<Meta>
  select<Input extends SelectionInput>(
    select: Input
  ): WithSelection<Input, Meta>
  select(select?: SelectionInput): any {
    return new Select<unknown, Meta>({
      ...get(this),
      select: select!
    })
  }

  selectDistinct(): WithoutSelection<Meta>
  selectDistinct<Input extends SelectionInput>(
    selection: Input
  ): WithSelection<Input, Meta>
  selectDistinct(select?: SelectionInput): any {
    return new Select({
      ...get(this),
      select: select!,
      distinct: true
    })
  }

  selectDistinctOn(
    this: BuilderBase<IsPostgres>,
    columns: Array<HasValue>
  ): WithoutSelection<Meta>
  selectDistinctOn<Input extends SelectionInput>(
    this: BuilderBase<IsPostgres>,
    columns: Array<HasValue>,
    selection: Input
  ): WithSelection<Input, Meta>
  selectDistinctOn(columns: any, select?: any): any {
    return new Select({
      ...get(this),
      select: select!,
      distinctOn: columns
    })
  }

  update<Definition extends TableDefinition>(
    table: Table<Definition>
  ): UpdateTable<Definition, Meta> {
    return new UpdateTable<Definition, Meta>({...get(this), update: table})
  }

  insert<Definition extends TableDefinition>(
    into: Table<Definition>
  ): InsertInto<Definition, Meta> {
    return new InsertInto<Definition, Meta>({...get(this), insert: into})
  }

  delete<Definition extends TableDefinition>(
    from: Table<Definition>
  ): DeleteFrom<Definition, Meta> {
    return new DeleteFrom<Definition, Meta>({...get(this), delete: from})
  }
}

export class Builder<Meta extends QueryMeta> extends BuilderBase<Meta> {
  $with<Input extends SelectionInput>(
    cteName: string,
    columns: Input
  ): {
    as(query: Sql): CTE<Input>
  }
  $with(cteName: string): {
    as<Input>(query: UnionBase<Input, Meta>): CTE<Input>
    as<Input>(query: Delete<Input, Meta>): CTE<Input>
    as<Input>(query: Update<Input, Meta>): CTE<Input>
    as<Input>(query: Insert<Input, Meta>): CTE<Input>
  }
  $with(
    cteName: string,
    columns?: SelectionInput
  ): {as(query: HasQuery): CTE} | {as(query: HasValue): CTE} {
    return {
      as(query: HasQuery | HasValue) {
        const {query: querySql, selection, value} = get(query)
        const input = querySql ? selection?.input : columns
        const sql = querySql ? querySql.nameSelf(cteName) : value
        const base = virtualTarget(cteName, input)
        return {
          ...base,
          [internal]: {
            ...get(base),
            query: sql!
          }
        }
      }
    }
  }

  with(...definitions: Array<CTE>): BuilderBase<Meta> {
    return new BuilderBase({...get(this), with: definitions})
  }

  withRecursive(...definitions: Array<CTE>): BuilderBase<Meta> {
    return new BuilderBase({...get(this), withRecursive: definitions})
  }
}
