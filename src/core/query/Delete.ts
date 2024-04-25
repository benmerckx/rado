import {
  getData,
  internalData,
  internalQuery,
  internalSelection,
  type HasSql,
  type HasTable
} from '../Internal.ts'
import type {QueryMeta} from '../MetaData.ts'
import {Query, QueryData} from '../Query.ts'
import {
  selection,
  type Selection,
  type SelectionInput,
  type SelectionRow
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
  readonly [internalData]: DeleteData<Meta>
  declare readonly [internalSelection]?: Selection

  constructor(data: DeleteData<Meta>) {
    super(data)
    this[internalData] = data
    if (data.returning) this[internalSelection] = data.returning
  }
  get [internalQuery]() {
    return sql.chunk('emitDelete', this)
  }
}

export class DeleteFrom<Meta extends QueryMeta> extends Delete<void, Meta> {
  where(condition: HasSql<boolean>) {
    return new DeleteFrom<Meta>({...getData(this), where: condition})
  }

  returning<Input extends SelectionInput>(returning: Input) {
    return new Delete<SelectionRow<Input>, Meta>({
      ...getData(this),
      returning: selection(returning)
    })
  }
}
