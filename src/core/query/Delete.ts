import {
  type HasSql,
  type HasTable,
  getData,
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
      returning: selection(returning ?? data.from)
    })
  }
}
