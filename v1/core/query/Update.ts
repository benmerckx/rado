import {type Expr, input} from '../Expr.ts'
import {
  type HasSql,
  type HasTable,
  getData,
  getSql,
  getTable,
  hasSql,
  internalData,
  internalQuery,
  internalSelection
} from '../Internal.ts'
import {Query, QueryData, type QueryMeta} from '../Query.ts'
import {
  Selection,
  type SelectionInput,
  type SelectionRow
} from '../Selection.ts'
import {sql} from '../Sql.ts'
import type {TableDefinition, TableUpdate} from '../Table.ts'

const {fromEntries, entries} = Object

class UpdateData<Meta extends QueryMeta = QueryMeta> extends QueryData<Meta> {
  table!: HasTable
  values?: Record<string, HasSql>
  where?: HasSql
  returning?: HasSql
}

export class Update<Result, Meta extends QueryMeta> extends Query<
  Result,
  Meta
> {
  readonly [internalData]: UpdateData<Meta>;
  readonly [internalSelection]?: Selection

  constructor(data: UpdateData<Meta>) {
    super(data)
    this[internalData] = data
    if (data.returning) this[internalSelection] = new Selection(data.returning)
  }

  get [internalQuery]() {
    const {values, where, returning} = getData(this)
    const table = getTable(getData(this).table)
    if (!values) throw new Error('No values to update')
    return sql
      .query({
        update: sql.identifier(table.name),
        set: sql.join(
          entries(values).map(
            ([key, value]) => sql`${sql.identifier(key)} = ${value}`
          ),
          sql`, `
        ),
        where,
        returning
      })
      .inlineFields(false)
  }
}

export class UpdateTable<
  Definition extends TableDefinition,
  Meta extends QueryMeta
> extends Update<void, Meta> {
  set(values: TableUpdate<Definition>): UpdateTable<Definition, Meta> {
    const update = fromEntries(
      entries(values).map(([key, value]) => {
        const expr = input(value)
        const sql = hasSql(expr) ? getSql(expr) : expr
        return [key, sql]
      })
    )
    return new UpdateTable({...getData(this), values: update})
  }

  where(condition: Expr<boolean>): UpdateTable<Definition, Meta> {
    return new UpdateTable({...getData(this), where: condition})
  }

  returning<Input extends SelectionInput>(
    selection: Input
  ): Update<SelectionRow<Input>, Meta> {
    return new Update({
      ...getData(this),
      returning: new Selection(selection).toSql()
    })
  }
}
