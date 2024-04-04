import {input, type Expr, type Input} from '../Expr.ts'
import {
  getColumn,
  getData,
  getTable,
  internalData,
  internalQuery,
  internalSelection,
  type HasSql,
  type HasTable
} from '../Internal.ts'
import {Query, QueryData, type QueryMeta} from '../Query.ts'
import {selection, type Selection} from '../Selection.ts'
import {sql} from '../Sql.ts'
import type {TableDefinition, TableInsert} from '../Table.ts'

class InsertIntoData<Meta extends QueryMeta> extends QueryData<Meta> {
  into!: HasTable
  values?: HasSql
}

class InsertData<Meta extends QueryMeta> extends InsertIntoData<Meta> {
  returning?: Selection
}

class Insert<Result, Meta extends QueryMeta> extends Query<Result, Meta> {
  readonly [internalData]: InsertData<Meta>;
  declare readonly [internalSelection]?: Selection

  constructor(data: InsertData<Meta>) {
    super(data)
    this[internalData] = data
    if (data.returning) this[internalSelection] = data.returning
  }

  returning<T>(returning: Expr<T>): Insert<T, Meta> {
    return new Insert({...getData(this), returning: selection(returning)})
  }

  get [internalQuery]() {
    const {into, values, returning} = getData(this)
    const table = getTable(into)
    const tableName = sql.identifier(table.name)
    return sql
      .query({
        'insert into': sql`${tableName}(${table.listColumns()})`,
        values,
        returning
      })
      .inlineFields(false)
  }
}

export class InsertInto<
  Definition extends TableDefinition,
  Meta extends QueryMeta
> {
  [internalData]: InsertData<Meta>
  constructor(data: InsertData<Meta>) {
    this[internalData] = data
  }

  values(value: TableInsert<Definition>): Insert<Definition, Meta>
  values(values: Array<TableInsert<Definition>>): Insert<Definition, Meta>
  values(insert: TableInsert<Definition> | Array<TableInsert<Definition>>) {
    const {into} = getData(this)
    const rows = Array.isArray(insert) ? insert : [insert]
    const table = getTable(into)
    const values = sql.join(
      rows.map((row: Record<string, Input>) => {
        return sql`(${sql.join(
          Object.entries(table.columns).map(([key, column]) => {
            const value = row[key]
            if (value !== undefined) return input(value)
            const {defaultValue, notNull} = getColumn(column)
            if (defaultValue) return defaultValue()
            if (notNull) throw new Error(`Column "${key}" is not nullable`)
            return sql.defaultValue()
          }),
          sql`, `
        )})`
      }),
      sql`, `
    )
    return new Insert<Definition, Meta>({...getData(this), values})
  }
}
