import {
  type HasSql,
  getData,
  getTable,
  internalData,
  internalQuery,
  internalSelection
} from '../Internal.ts'
import type {IsPostgres, IsSqlite, QueryMeta} from '../MetaData.ts'
import {Query, type QueryData} from '../Query.ts'
import {
  type Selection,
  type SelectionInput,
  type SelectionRow,
  selection
} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
import type {TableDefinition, TableRow} from '../Table.ts'
import {and} from '../expr/Conditions.ts'
import {withCTE} from './CTE.ts'
import type {DeleteQuery} from './Query.ts'

export class Delete<
  Returning,
  Meta extends QueryMeta = QueryMeta
> extends Query<Returning, Meta> {
  readonly [internalData]: QueryData<Meta> & DeleteQuery
  declare readonly [internalSelection]?: Selection

  constructor(data: QueryData<Meta> & DeleteQuery) {
    super(data)
    this[internalData] = data
    if (data.returning) this[internalSelection] = selection(data.returning)
  }

  get [internalQuery](): Sql {
    return deleteQuery(getData(this))
  }
}

export class DeleteFrom<
  Definition extends TableDefinition,
  Meta extends QueryMeta
> extends Delete<void, Meta> {
  where(
    ...where: Array<HasSql<boolean> | undefined>
  ): DeleteFrom<Definition, Meta> {
    return new DeleteFrom({...getData(this), where: and(...where)})
  }
  returning(
    this: DeleteFrom<Definition, IsPostgres | IsSqlite>
  ): Delete<TableRow<Definition>, Meta>
  returning<Input extends SelectionInput>(
    this: DeleteFrom<Definition, IsPostgres | IsSqlite>,
    returning: Input
  ): Delete<SelectionRow<Input>, Meta>
  returning(returning?: SelectionInput) {
    const data = getData(this)
    return new Delete({
      ...data,
      returning
    })
  }
}

export function deleteQuery(query: DeleteQuery): Sql {
  const {delete: from, where, returning} = query
  const table = getTable(from)
  return withCTE(
    query,
    sql.query({
      deleteFrom: sql.identifier(table.name),
      where,
      returning: returning && selection(returning)
    })
  )
}
