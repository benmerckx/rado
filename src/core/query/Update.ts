import {and} from '../expr/Conditions.ts'
import {type Input as UserInput, mapToColumn} from '../expr/Input.ts'
import {
  type HasQuery,
  type HasSql,
  getData,
  getTable,
  internalData,
  internalQuery,
  internalSelection
} from '../Internal.ts'
import type {IsPostgres, IsSqlite, QueryMeta} from '../MetaData.ts'
import {
  type MutationOutput,
  MutationQuery,
  type MutationReturning,
  type QueryData
} from '../Queries.ts'
import {type Selection, type SelectionInput, selection} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
import type {TableDefinition, TableFields, TableUpdate} from '../Table.ts'
import {formatCTE} from './CTE.ts'
import type {UpdateQuery} from './Query.ts'
import {formatModifiers} from './Shared.ts'

export class Update<
  Returning extends MutationReturning,
  Meta extends QueryMeta = QueryMeta
>
  extends MutationQuery<Returning, Meta>
  implements HasQuery<MutationOutput<Returning, Meta>>
{
  readonly [internalData]: QueryData<Meta> & UpdateQuery
  declare readonly [internalSelection]?: Selection

  constructor(data: QueryData<Meta> & UpdateQuery) {
    super(data)
    this[internalData] = data
    if (data.returning) this[internalSelection] = selection(data.returning)
  }

  get [internalQuery](): Sql<MutationOutput<Returning, Meta>> {
    return updateQuery(getData(this)) as Sql<MutationOutput<Returning, Meta>>
  }

  limit(limit: UserInput<number>): Update<Returning, Meta> {
    return new Update({...getData(this), limit})
  }

  offset(offset: UserInput<number>): Update<Returning, Meta> {
    return new Update({...getData(this), offset})
  }

  orderBy(...orderBy: Array<HasSql>): Update<Returning, Meta> {
    return new Update({...getData(this), orderBy})
  }
}

export class UpdateTable<
  Definition extends TableDefinition,
  Meta extends QueryMeta
> extends Update<void, Meta> {
  set(set: TableUpdate<Definition>): UpdateTable<Definition, Meta> {
    const data = getData(this)
    const hasDefinedValue = Object.values(set).some(
      value => value !== undefined
    )
    if (!hasDefinedValue) {
      const hasOnUpdate = Object.values(getTable(data.update).columns).some(
        column => !!getData(column).$onUpdate
      )
      if (!hasOnUpdate) throw new Error('No values to set')
    }
    return new UpdateTable<Definition, Meta>({...data, set})
  }

  where(
    ...where: Array<HasSql<boolean> | undefined>
  ): UpdateTable<Definition, Meta> {
    return new UpdateTable<Definition, Meta>({
      ...getData(this),
      where: and(...where)
    })
  }

  returning(
    this: UpdateTable<Definition, IsPostgres | IsSqlite>
  ): Update<TableFields<Definition>, Meta>
  returning<Input extends SelectionInput>(
    this: UpdateTable<Definition, IsPostgres | IsSqlite>,
    returning?: Input
  ): Update<Input, Meta>
  returning(returning?: SelectionInput): Update<SelectionInput, Meta> {
    const data = getData(this)
    return new Update({
      ...data,
      returning: returning ?? data.update
    })
  }
}

export function updateQuery(query: UpdateQuery): Sql {
  const {update: table, set: values, where, returning} = query
  const tableApi = getTable(table)
  if (!values) throw new Error('Update values are required')
  const assignments = Object.entries(tableApi.columns).flatMap(
    ([key, column]) => {
      const columnApi = getData(column)
      const {name, $onUpdate} = columnApi
      const value = values[key]
      let expr: unknown
      if (value === undefined) {
        if ($onUpdate) expr = $onUpdate()
        else return []
      } else {
        expr = mapToColumn(columnApi, value)
      }
      const fieldName = name ?? key
      return [sql`${sql.identifier(fieldName)} = ${expr}`]
    }
  )
  if (assignments.length === 0) throw new Error('No values to set')
  const set = sql.join(assignments, sql`, `)
  return sql
    .query(
      formatCTE(query),
      {
        update: tableApi.identifier(),
        set,
        where,
        returning: returning && selection(returning)
      },
      formatModifiers(query)
    )
    .inlineFields(false)
}
