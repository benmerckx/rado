import type {Expr} from '../Expr.ts'
import {
  type HasSql,
  type HasTable,
  getData,
  getTable,
  internal
} from '../Internal.ts'
import {Query, QueryData, type QueryMeta} from '../Query.ts'
import {
  Selection,
  type SelectionInput,
  type SelectionRow
} from '../Selection.ts'
import {sql} from '../Sql.ts'

class DeleteData<Meta extends QueryMeta = QueryMeta> extends QueryData<Meta> {
  from!: HasTable
  where?: HasSql
  returning?: HasSql
}

export class Delete<Result, Meta extends QueryMeta> extends Query<
  Result,
  Meta
> {
  readonly [internal.data]: DeleteData<Meta>;
  readonly [internal.selection]?: Selection

  constructor(data: DeleteData<Meta>) {
    super(data)
    this[internal.data] = data
    if (data.returning) this[internal.selection] = new Selection(data.returning)
  }

  get [internal.query]() {
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
    selection: Input
  ): Delete<SelectionRow<Input>, Meta> {
    return new Delete({
      ...getData(this),
      returning: new Selection(selection).toSql()
    })
  }
}

function remove(from: HasTable): DeleteFrom<QueryMeta> {
  return new DeleteFrom({from})
}

export {remove as delete}
