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
import {type QueryData, SingleQuery} from '../Queries.ts'
import {
  type Selection,
  type SelectionInput,
  type SelectionRow,
  selection
} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
import type {TableDefinition, TableRow} from '../Table.ts'
import {and} from '../expr/Conditions.ts'
import type {Input} from '../expr/Input.ts'
import {formatCTE} from './CTE.ts'
import type {DeleteQuery} from './Query.ts'

export class Delete<Result, Meta extends QueryMeta = QueryMeta>
  extends SingleQuery<Result, Meta>
  implements HasQuery<Result>
{
  readonly [internalData]: QueryData<Meta> & DeleteQuery
  declare readonly [internalSelection]?: Selection

  constructor(data: QueryData<Meta> & DeleteQuery) {
    super(data)
    this[internalData] = data
    if (data.returning) this[internalSelection] = selection(data.returning)
  }

  get [internalQuery](): Sql<Result> {
    return deleteQuery(getData(this)) as Sql<Result>
  }

  limit(limit: Input<number>): Delete<Result, Meta> {
    return new Delete({...getData(this), limit})
  }

  offset(offset: Input<number>): Delete<Result, Meta> {
    return new Delete({...getData(this), offset})
  }

  orderBy(...orderBy: Array<HasSql>): Delete<Result, Meta> {
    return new Delete({...getData(this), orderBy})
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
  ): Delete<Array<TableRow<Definition>>, Meta>
  returning<Input extends SelectionInput>(
    this: DeleteFrom<Definition, IsPostgres | IsSqlite>,
    returning: Input
  ): Delete<Array<SelectionRow<Input>>, Meta>
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
  return sql.query(formatCTE(query), {
    deleteFrom: sql.identifier(table.name),
    where,
    returning: returning && selection(returning)
  })
}
