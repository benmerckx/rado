import {
  getData,
  internalData,
  internalQuery,
  internalSelection,
  type HasSql,
  type HasTable
} from '../Internal.ts'
import type {QueryMeta} from '../MetaData.ts'
import {Query, type QueryData} from '../Query.ts'
import {
  selection,
  type Selection,
  type SelectionInput,
  type SelectionRow
} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'

export interface DeleteData<Meta extends QueryMeta = QueryMeta>
  extends QueryData<Meta> {
  from: HasTable
  where?: HasSql
  returning?: Selection
}

export class Delete<Result, Meta extends QueryMeta = QueryMeta> extends Query<
  Result,
  Meta
> {
  readonly [internalData]: DeleteData<Meta>
  declare readonly [internalSelection]?: Selection

  constructor(data: DeleteData<Meta>) {
    super(data)
    this[internalData] = data
    if (data.returning) this[internalSelection] = data.returning
  }
  get [internalQuery](): Sql {
    return sql.chunk('emitDelete', this)
  }
}

export class DeleteFrom<Meta extends QueryMeta> extends Delete<void, Meta> {
  where(condition: HasSql<boolean>): DeleteFrom<Meta> {
    return new DeleteFrom({...getData(this), where: condition})
  }

  returning<Input extends SelectionInput>(
    returning: Input
  ): Delete<SelectionRow<Input>, Meta> {
    return new Delete({
      ...getData(this),
      returning: selection(returning)
    })
  }
}
