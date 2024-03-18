import {Expr, input} from '../Expr.ts'
import {
  HasExpr,
  HasQuery,
  HasTable,
  getColumn,
  getExpr,
  getTable,
  hasExpr,
  meta
} from '../Meta.ts'
import {Sql, sql} from '../Sql.ts'
import {TableDefinition, TableInsert} from '../Table.ts'

const {fromEntries, entries} = Object

class InsertIntoData {
  into!: HasTable
  values?: Array<Record<string, Sql | HasExpr>>
  select?: Sql
}

class InsertData extends InsertIntoData {
  returning?: HasExpr
}

class Insert<Returning> implements HasQuery {
  #data: InsertData
  constructor(data: InsertData) {
    this.#data = data
  }

  returning<T>(returning: Expr<T>): Insert<T> {
    return new Insert({...this.#data, returning})
  }

  get [meta.query]() {
    const {into, values, select, returning} = this.#data
    const table = getTable(into)
    const tableName = sql.identifier(table.name)
    if (values && select) throw new Error('Cannot have both values and select')
    return sql.join([
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
                  if (hasExpr(value))
                    return getExpr(value)({includeTableName: false})
                  return value
                }
                if (defaultValue) return defaultValue()
                if (notNull) throw new Error(`Column "${key}" is not nullable`)
                return sql.defaultValue()
              }),
              sql`, `
            )})`
          }),
          sql`, `
        )}`,
      returning &&
        sql`returning ${getExpr(returning)({includeTableName: false})}`
    ])
  }
}

export class InsertInto<Definition extends TableDefinition> {
  #data: InsertData
  constructor(data: InsertData) {
    this.#data = data
  }

  values(value: TableInsert<Definition>): Insert<Definition>
  values(values: Array<TableInsert<Definition>>): Insert<Definition>
  values(values: TableInsert<Definition> | Array<TableInsert<Definition>>) {
    const rows = (Array.isArray(values) ? values : [values]).map(row => {
      return fromEntries(
        entries(row).map(([key, value]) => {
          const expr = input(value)
          const sql = hasExpr(expr)
            ? getExpr(expr)({includeTableName: false})
            : expr
          return [key, sql]
        })
      )
    })
    return new Insert<Definition>({...this.#data, values: rows})
  }

  /*select<T>(query: Expr<T>) {
    return new Insert({...this.#data, select: getExpr(query)})
  }*/
}
