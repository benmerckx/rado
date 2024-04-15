import {emitDelete} from '../Emitter.ts'
import type {Expr} from '../Expr.ts'
import {
  type HasSql,
  type HasTable,
  getData,
  internalData,
  internalQuery,
  internalSelection
} from '../Internal.ts'
import type {QueryMeta} from '../MetaData.ts'
import {Query, QueryData} from '../Query.ts'
import {
  type Selection,
  type SelectionInput,
  type SelectionRow,
  selection
} from '../Selection.ts'
import {sql} from '../Sql.ts'

export class DeleteData<
  Meta extends QueryMeta = QueryMeta
> extends QueryData<Meta> {
  from!: HasTable
  where?: HasSql
  returning?: Selection
}

export class Delete<Result, Meta extends QueryMeta = QueryMeta> extends Query<
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
    return sql.chunk(emitDelete, this)
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
