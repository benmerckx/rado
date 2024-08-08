import {
  type HasSql,
  type HasTable,
  getData,
  getTable,
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
import type {TableDefinition, TableRow, TableUpdate} from '../Table.ts'
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
    const {table} = getData(this)
    const set = sql.join(
      Object.entries(values).map(([key, value]) => {
        const column = getTable(table).columns[key]
        const {mapToDriverValue} = getData(column)
        return sql`${sql.identifier(key)} = ${input(
          mapToDriverValue?.(value) ?? value
        )}`
      }),
      sql`, `
    )
    return new UpdateTable<Definition, Meta>({...getData(this), set})
  }

  where(where: HasSql<boolean>): UpdateTable<Definition, Meta> {
    return new UpdateTable<Definition, Meta>({...getData(this), where})
  }

  returning(
    this: UpdateTable<Definition, IsPostgres | IsSqlite>
  ): Update<TableRow<Definition>, Meta>
  returning<Input extends SelectionInput>(
    this: UpdateTable<Definition, IsPostgres | IsSqlite>,
    returning?: Input
  ): Update<SelectionRow<Input>, Meta>
  returning(returning?: SelectionInput) {
    const data = getData(this)
    return new Update({
      ...data,
      returning: selection(returning ?? data.table)
    })
  }
}
