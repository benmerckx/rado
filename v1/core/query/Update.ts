import {emitUpdate} from '../Emitter.ts'
import {type Expr, input} from '../Expr.ts'
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
import type {TableDefinition, TableUpdate} from '../Table.ts'

export class UpdateData<
  Meta extends QueryMeta = QueryMeta
> extends QueryData<Meta> {
  table!: HasTable
  set?: HasSql
  where?: HasSql
  returning?: Selection
}

export class Update<Result, Meta extends QueryMeta = QueryMeta> extends Query<
  Result,
  Meta
> {
  readonly [internalData]: UpdateData<Meta>;
  declare readonly [internalSelection]?: Selection

  constructor(data: UpdateData<Meta>) {
    super(data)
    this[internalData] = data
    if (data.returning) this[internalSelection] = data.returning
  }

  get [internalQuery]() {
    return sql.chunk(emitUpdate, this)
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
    return new UpdateTable({...getData(this), set})
  }

  where(where: Expr<boolean>): UpdateTable<Definition, Meta> {
    return new UpdateTable({...getData(this), where})
  }

  returning<Input extends SelectionInput>(
    returning: Input
  ): Update<SelectionRow<Input>, Meta> {
    return new Update({
      ...getData(this),
      returning: selection(returning)
    })
  }
}
