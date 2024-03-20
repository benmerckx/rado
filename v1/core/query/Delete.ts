import type {Expr} from '../Expr.ts'
import {
  getData,
  getExpr,
  getTable,
  internal,
  type HasExpr,
  type HasTable
} from '../Internal.ts'
import {Query, QueryData, type QueryMode} from '../Query.ts'
import {
  Selection,
  type SelectionInput,
  type SelectionRow
} from '../Selection.ts'
import {sql, type Sql} from '../Sql.ts'

class DeleteData<Mode extends QueryMode = QueryMode> extends QueryData<Mode> {
  from!: HasTable
  where?: HasExpr
  returning?: Sql
}

export class Delete<Result, Mode extends QueryMode> extends Query<
  Result,
  Mode
> {
  readonly [internal.data]: DeleteData<Mode>

  constructor(data: DeleteData<Mode>) {
    super(data)
    this[internal.data] = data
  }

  get [internal.query]() {
    const {from, where, returning} = getData(this)
    const table = getTable(from)
    return sql.join([
      sql`delete from`,
      sql.identifier(table.name),
      where && sql`where ${getExpr(where)}`,
      returning && sql`returning ${returning}`
    ])
  }
}

export class DeleteFrom<Mode extends QueryMode> extends Delete<void, Mode> {
  where(condition: Expr<boolean>): DeleteFrom<Mode> {
    return new DeleteFrom({...getData(this), where: condition})
  }

  returning<Input extends SelectionInput>(
    selection: Input
  ): Delete<SelectionRow<Input>, Mode> {
    return new Delete({
      ...getData(this),
      returning: new Selection(selection).toSql()
    })
  }
}

function remove(from: HasTable): DeleteFrom<undefined> {
  return new DeleteFrom({from})
}

export {remove as delete}
