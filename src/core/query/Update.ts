import {
  type HasQuery,
  type HasSql,
  getData,
  getTable,
  hasSql,
  internalData,
  internalQuery,
  internalSelection
} from '../Internal.ts'
import type {IsPostgres, IsSqlite, QueryMeta} from '../MetaData.ts'
import {type QueryData, SingleQuery} from '../Queries.ts'
import {
  type Selection,
  type SelectionInput,
  type SelectionRow,
  selection
} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
import type {TableDefinition, TableRow, TableUpdate} from '../Table.ts'
import {and} from '../expr/Conditions.ts'
import {type Input, input} from '../expr/Input.ts'
import {formatCTE} from './CTE.ts'
import type {UpdateQuery} from './Query.ts'

export class Update<Result, Meta extends QueryMeta = QueryMeta>
  extends SingleQuery<Array<Result>, Meta>
  implements HasQuery<Result>
{
  readonly [internalData]: QueryData<Meta> & UpdateQuery
  declare readonly [internalSelection]?: Selection

  constructor(data: QueryData<Meta> & UpdateQuery) {
    super(data)
    this[internalData] = data
    if (data.returning) this[internalSelection] = selection(data.returning)
  }

  get [internalQuery](): Sql<Result> {
    return updateQuery(getData(this)) as Sql<Result>
  }

  limit(limit: Input<number>): Update<Result, Meta> {
    return new Update({...getData(this), limit})
  }

  offset(offset: Input<number>): Update<Result, Meta> {
    return new Update({...getData(this), offset})
  }

  orderBy(...orderBy: Array<HasSql>): Update<Result, Meta> {
    return new Update({...getData(this), orderBy})
  }
}

export class UpdateTable<
  Definition extends TableDefinition,
  Meta extends QueryMeta
> extends Update<void, Meta> {
  set(set: TableUpdate<Definition>): UpdateTable<Definition, Meta> {
    return new UpdateTable<Definition, Meta>({...getData(this), set})
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
  ): Update<TableRow<Definition>, Meta>
  returning<Input extends SelectionInput>(
    this: UpdateTable<Definition, IsPostgres | IsSqlite>,
    returning?: Input
  ): Update<SelectionRow<Input>, Meta>
  returning(returning?: SelectionInput) {
    const data = getData(this)
    return new Update({...data, returning: returning ?? data.update})
  }
}

export function updateQuery(query: UpdateQuery): Sql {
  const {update: table, set: values, where, returning} = query
  const tableApi = getTable(table)
  if (!values) throw new Error('Update values are required')
  const set = sql.join(
    Object.entries(values).map(([key, value]) => {
      const column = getTable(table).columns[key]
      const {mapToDriverValue} = getData(column)
      const expr =
        value && typeof value === 'object' && hasSql(value)
          ? value
          : input(mapToDriverValue?.(value) ?? value)
      return sql`${sql.identifier(key)} = ${expr}`
    }),
    sql`, `
  )
  return sql
    .query(formatCTE(query), {
      update: sql.identifier(tableApi.name),
      set,
      where,
      returning: returning && selection(returning)
    })
    .inlineFields(false)
}
