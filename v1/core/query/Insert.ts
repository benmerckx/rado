import {type Expr, input} from '../Expr.ts'
import {
  type HasSql,
  type HasTable,
  getColumn,
  getData,
  getSql,
  getTable,
  hasSql,
  internal
} from '../Internal.ts'
import {Query, QueryData, type QueryMeta} from '../Query.ts'
import {Selection} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
import type {Table, TableDefinition, TableInsert} from '../Table.ts'

const {fromEntries, entries} = Object

class InsertIntoData<Meta extends QueryMeta> extends QueryData<Meta> {
  into!: HasTable
  values?: Array<Record<string, Sql | HasSql>>
  select?: HasSql
}

class InsertData<Meta extends QueryMeta> extends InsertIntoData<Meta> {
  returning?: HasSql
}

class Insert<Result, Meta extends QueryMeta> extends Query<Result, Meta> {
  readonly [internal.data]: InsertData<Meta>;
  readonly [internal.selection]?: Selection

  constructor(data: InsertData<Meta>) {
    super(data)
    this[internal.data] = data
    if (data.returning) this[internal.selection] = new Selection(data.returning)
  }

  returning<T>(returning: Expr<T>): Insert<T, Meta> {
    return new Insert({...getData(this), returning})
  }

  get [internal.query]() {
    const {into, values, select, returning} = getData(this)
    const table = getTable(into)
    const tableName = sql.identifier(table.name)
    if (values && select) throw new Error('Cannot have both values and select')
    return sql
      .join([
        sql`insert into`,
        sql`${tableName}(${table.listColumns()})`,
        select,
        values &&
          sql`values ${sql.join(
            values.map(row => {
              return sql`(${sql.join(
                Object.entries(table.columns).map(([key, column]) => {
                  const value = row[key]
                  const {defaultValue, notNull} = getColumn(column)
                  if (value !== undefined) {
                    if (hasSql(value)) return getSql(value)
                    return value
                  }
                  if (defaultValue) return defaultValue()
                  if (notNull)
                    throw new Error(`Column "${key}" is not nullable`)
                  return sql.defaultValue()
                }),
                sql`, `
              )})`
            }),
            sql`, `
          )}`,
        returning && sql`returning ${getSql(returning)}`
      ])
      .inlineFields(false)
  }
}

export class InsertInto<
  Definition extends TableDefinition,
  Meta extends QueryMeta
> {
  [internal.data]: InsertData<Meta>
  constructor(data: InsertData<Meta>) {
    this[internal.data] = data
  }

  values(value: TableInsert<Definition>): Insert<Definition, Meta>
  values(values: Array<TableInsert<Definition>>): Insert<Definition, Meta>
  values(values: TableInsert<Definition> | Array<TableInsert<Definition>>) {
    const rows = (Array.isArray(values) ? values : [values]).map(row => {
      return fromEntries(
        entries(row).map(([key, value]) => {
          const expr = input(value)
          const sql = hasSql(expr) ? getSql(expr) : expr
          return [key, sql]
        })
      )
    })
    return new Insert<Definition, Meta>({...getData(this), values: rows})
  }

  /*select<T>(query: Expr<T>) {
    return new Insert({...getData(this), select: getExpr(query)})
  }*/
}

export function insert<Definition extends TableDefinition>(
  into: Table<Definition>
): InsertInto<Definition, QueryMeta> {
  return new InsertInto({into})
}
