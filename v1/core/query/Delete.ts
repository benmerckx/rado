import type {Expr} from '../Expr.ts'
import {
  getData,
  getTable,
  internalData,
  internalQuery,
  internalSelection,
  type HasSql,
  type HasTable
} from '../Internal.ts'
import {Query, QueryData, type QueryMeta} from '../Query.ts'
import {
  selection,
  type Selection,
  type SelectionInput,
  type SelectionRow
} from '../Selection.ts'
import {sql} from '../Sql.ts'

class DeleteData<Meta extends QueryMeta = QueryMeta> extends QueryData<Meta> {
  from!: HasTable
  where?: HasSql
  returning?: Selection
}

export class Delete<Result, Meta extends QueryMeta> extends Query<
  Result,
  Meta
> {
  readonly [internalData]: DeleteData<Meta>;
  declare readonly [internalSelection]?: Selection

  constructor(data: DeleteData<Meta>) {
    super(data)
    this[internalData] = data
    if (data.returning) this[internalSelection] = data.returning
  }

  get [internalQuery]() {
    const {from, where, returning} = getData(this)
    const table = getTable(from)
    return sql.query({
      'delete from': sql.identifier(table.name),
      where,
      returning
    })
  }
}

export class DeleteFrom<Meta extends QueryMeta> extends Delete<void, Meta> {
  where(condition: Expr<boolean>): DeleteFrom<Meta> {
    return new DeleteFrom({...getData(this), where: condition})
  }

  returning<Input extends SelectionInput>(
    returning: Input
  ): Delete<SelectionRow<Input>, Meta> {
    return new Delete({...getData(this), returning: selection(returning)})
  }
}
