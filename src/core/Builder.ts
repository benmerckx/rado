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
import type {MutationQuery, QueryData, SingleQuery} from './Queries.ts'
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
  type Extend,
  StarSelection,
  extend,
  selection,
  type SelectionInput,
  type SelectionRecord,
  type SelectionRow
} from './Selection.ts'
import {Sql} from './Sql.ts'
import type {Scope, Table, TableDefinition} from './Table.ts'
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
  ): SingleQuery<SelectionRow<Returning>, Meta> &
    HasSql<SelectionRow<Returning>>
  $query<const From extends FromGuard>(
    from: FromQuery<From>
  ): SingleQuery<FromRow<From>, Meta> & HasSql<FromRow<From>>
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
  select<
    Definition extends TableDefinition,
    Name extends string,
    Extra extends SelectionRecord
  >(
    table: Table<Definition, Name>,
    extra: Extra
  ): WithSelection<Extend<Definition, Name, Extra>, Meta>
  select(select?: SelectionInput, extra?: SelectionRecord): any {
    return new Select<unknown, Meta>({
      ...getData(this),
      select: extend(select!, extra)
    })
  }

  selectDistinct(): WithoutSelection<Meta>
  selectDistinct<Input extends SelectionInput>(
    selection: Input
  ): WithSelection<Input, Meta>
  selectDistinct<
    Definition extends TableDefinition,
    Name extends string,
    Extra extends SelectionRecord
  >(
    table: Table<Definition, Name>,
    extra: Extra
  ): WithSelection<Extend<Definition, Name, Extra>, Meta>
  selectDistinct(select?: SelectionInput, extra?: SelectionRecord): any {
    return new Select({
      ...getData(this),
      select: extend(select!, extra),
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
  selectDistinctOn<
    Definition extends TableDefinition,
    Name extends string,
    Extra extends SelectionRecord
  >(
    this: BuilderBase<IsPostgres>,
    columns: Array<HasSql>,
    table: Table<Definition, Name>,
    extra: Extra
  ): WithSelection<Extend<Definition, Name, Extra>, Meta>
  selectDistinctOn(columns: any, select?: any, extra?: any): any {
    return new Select({
      ...getData(this),
      select: extend(select!, extra),
      distinctOn: columns
    })
  }

  update<Definition extends TableDefinition>(
    table: Table<Definition> | Scope<Definition>
  ): UpdateTable<Definition, Meta> {
    const update = table as Table<Definition>
    return new UpdateTable<Definition, Meta>({...getData(this), update})
  }

  insert<Definition extends TableDefinition>(
    into: Table<Definition> | Scope<Definition>
  ): InsertInto<Definition, Meta> {
    const insert = into as Table<Definition>
    return new InsertInto<Definition, Meta>({...getData(this), insert})
  }

  delete<Definition extends TableDefinition>(
    from: Table<Definition> | Scope<Definition>
  ): DeleteFrom<Definition, Meta> {
    const table = from as Table<Definition>
    return new DeleteFrom<Definition, Meta>({...getData(this), delete: table})
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
    as<Input extends SelectionInput>(
      query: MutationQuery<Input, Meta>
    ): CTE<Input>
    as(query: HasQuery): CTE
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
