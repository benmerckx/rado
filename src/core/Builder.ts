import {
  type HasQuery,
  type HasSql,
  getData,
  getQuery,
  getSelection,
  getSql,
  hasData,
  hasQuery,
  hasSql,
  hasSelection,
  internalData,
  internalSelection,
  internalQuery
} from './Internal.ts'
import type {IsPostgres, QueryMeta} from './MetaData.ts'
import type {QueryData, SingleQuery} from './Queries.ts'
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
import {
  StarSelection,
  selection,
  type SelectionInput,
  type SelectionRow
} from './Selection.ts'
import {Sql} from './Sql.ts'
import type {Table, TableDefinition} from './Table.ts'
import {virtualTarget} from './Virtual.ts'

function aliasSql(input: HasSql, name: string): Sql {
  const expr = getSql(input)
  if (expr.alias) return expr
  const aliased = new Sql(emitter => expr.emit(emitter))
  aliased.alias = name
  aliased.mapFromDriverValue = expr.mapFromDriverValue
  return aliased
}

function aliasUnnamedFields(
  input: SelectionInput,
  name?: string
): SelectionInput {
  if (hasSql(input as HasSql)) {
    if (!name) return input
    return aliasSql(input as HasSql, name)
  }
  if (!input || typeof input !== 'object') return input
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      aliasUnnamedFields(value, key)
    ])
  )
}

class BuilderBase<Meta extends QueryMeta> {
  readonly [internalData]: QueryData<Meta> & QueryBase

  constructor(data: QueryData<Meta> & QueryBase = {}) {
    this[internalData] = data
  }

  $query<Returning extends SelectionInput>(
    select: SelectionQuery<Returning>
  ): SingleQuery<Returning, Meta>
  $query<const From extends FromGuard>(
    from: FromQuery<From>
  ): SingleQuery<FromRow<From>, Meta>
  $query<Returning extends SelectionInput, Definition extends TableDefinition>(
    insert: InsertQuery<Returning, Definition>
  ): SingleQuery<Returning, Meta>
  $query<Returning extends SelectionInput, Definition extends TableDefinition>(
    remove: DeleteQuery<Returning, Definition>
  ): SingleQuery<Returning, Meta>
  $query<Returning extends SelectionInput, Definition extends TableDefinition>(
    update: UpdateQuery<Returning, Definition>
  ): SingleQuery<Returning, Meta>
  $query(query: Query): SingleQuery<unknown, Meta> {
    const data = {...getData(this), ...query}
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
    this: BuilderBase<IsPostgres>,
    columns: Array<HasSql>
  ): WithoutSelection<Meta>
  selectDistinctOn<Input extends SelectionInput>(
    this: BuilderBase<IsPostgres>,
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
  ): {as(query: HasQuery): CTE} | {as(query: HasSql): CTE} {
    return {
      as(query: HasQuery | HasSql) {
        let input = hasQuery(query)
          ? hasSelection(query)
            ? getSelection(query).input
            : columns
          : columns
        const data =
          hasQuery(query) && hasData(query) ? getData<any>(query) : undefined
        if (input && data?.compound?.length > 1)
          input = aliasUnnamedFields(input)
        const target = virtualTarget(cteName, input ?? {})
        return {
          ...target,
          [internalSelection]: new StarSelection(target),
          get [internalQuery]() {
            return hasQuery(query)
              ? getQuery(query).nameSelf(cteName)
              : getSql(query)
          }
        }
      }
    }
  }

  with(...definitions: Array<CTE>): BuilderBase<Meta> {
    return new BuilderBase({...getData(this), with: definitions})
  }

  withRecursive(...definitions: Array<CTE>): BuilderBase<Meta> {
    return new BuilderBase({...getData(this), withRecursive: definitions})
  }
}
