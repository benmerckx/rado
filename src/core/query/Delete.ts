import {
  type HasSql,
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
import {Sql} from '../Sql.ts'
import type {TableDefinition, TableRow} from '../Table.ts'
import {and} from '../expr/Conditions.ts'
import type {DeleteQuery} from './Query.ts'

export class Delete<
  Returning,
  Meta extends QueryMeta = QueryMeta
> extends Query<Returning, Meta> {
  readonly [internalData]: QueryData<Meta> & DeleteQuery<Returning>

  constructor(data: QueryData<Meta> & DeleteQuery<Returning>) {
    super(data)
    this[internalData] = data
  }
  get [internalQuery](): Sql {
    return new Sql(emitter => emitter.emitDelete(this))
  }
  get [internalSelection](): Selection | undefined {
    const {returning} = getData(this)
    return returning && selection(returning)
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
  returning<Returning>(returning?: Returning) {
    const data = getData(this)
    return new Delete({
      ...data,
      returning
    })
  }
}
