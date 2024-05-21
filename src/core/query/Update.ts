import {
  getData,
  internalData,
  internalQuery,
  internalSelection,
  type HasSql,
  type HasTable
} from '../Internal.ts'
import type {IsPostgres, IsSqlite, QueryMeta} from '../MetaData.ts'
import {Query, type QueryData} from '../Query.ts'
import {
  selection,
  type Selection,
  type SelectionInput,
  type SelectionRow
} from '../Selection.ts'
import {sql, type Sql} from '../Sql.ts'
import type {TableDefinition, TableUpdate} from '../Table.ts'
import {input} from '../expr/Input.ts'

export interface UpdateData<Meta extends QueryMeta = QueryMeta>
  extends QueryData<Meta> {
  table: HasTable
  set?: HasSql
  where?: HasSql
  returning?: Selection
}

export class Update<Result, Meta extends QueryMeta = QueryMeta> extends Query<
  Result,
  Meta
> {
  readonly [internalData]: UpdateData<Meta>
  declare readonly [internalSelection]?: Selection

  constructor(data: UpdateData<Meta>) {
    super(data)
    this[internalData] = data
    if (data.returning) this[internalSelection] = data.returning
  }

  get [internalQuery](): Sql {
    return sql.chunk('emitUpdate', this)
  }
}

export class UpdateTable<
  Definition extends TableDefinition,
  Meta extends QueryMeta
> extends Update<void, Meta> {
  set(values: TableUpdate<Definition>): UpdateTable<Definition, Meta> {
    const set = sql.join(
      Object.entries(values).map(
        ([key, value]) => sql`${sql.identifier(key)} = ${input(value)}`
      ),
      sql`, `
    )
    return new UpdateTable<Definition, Meta>({...getData(this), set})
  }

  where(where: HasSql<boolean>): UpdateTable<Definition, Meta> {
    return new UpdateTable<Definition, Meta>({...getData(this), where})
  }

  returning<Input extends SelectionInput>(
    this: UpdateTable<Definition, IsPostgres | IsSqlite>,
    returning: Input
  ): Update<SelectionRow<Input>, Meta> {
    return new Update<SelectionRow<Input>, Meta>({
      ...getData(this as UpdateTable<Definition, Meta>),
      returning: selection(returning)
    })
  }
}
