import type {ColumnData} from './Column.ts'
import type {FieldApi} from './Field.ts'
import {getData, getQuery, getSelection, getTable} from './Internal.ts'
import type {QueryMeta} from './MetaData.ts'
import {type Param, ValueParam} from './Param.ts'
import {sql} from './Sql.ts'
import type {CreateData} from './query/Create.ts'
import type {Delete} from './query/Delete.ts'
import type {Insert} from './query/Insert.ts'
import type {Select} from './query/Select.ts'
import type {Union} from './query/Union.ts'
import type {Update} from './query/Update.ts'

export const emitUnsafe = Symbol()
export const emitIdentifier = Symbol()
export const emitValue = Symbol()
export const emitInline = Symbol()
export const emitJsonPath = Symbol()
export const emitPlaceholder = Symbol()
export const emitDefaultValue = Symbol()
export const emitField = Symbol()

export const emitColumn = Symbol()

export const emitCreate = Symbol()
export const emitDelete = Symbol()
export const emitInsert = Symbol()
export const emitSelect = Symbol()
export const emitUnion = Symbol()
export const emitUpdate = Symbol()

export abstract class Emitter<Meta extends QueryMeta = QueryMeta> {
  sql = ''
  protected params: Array<Param> = []

  bind(inputs?: Record<string, unknown>) {
    return this.params.map(param => {
      if (param instanceof ValueParam) return param.value
      if (inputs && param.name in inputs) return inputs[param.name]
      throw new Error(`Missing input for named parameter: ${param.name}`)
    })
  }

  abstract [emitIdentifier](value: string): void
  abstract [emitValue](value: unknown): void
  abstract [emitInline](value: unknown): void
  abstract [emitJsonPath](value: Array<number | string>): void
  abstract [emitPlaceholder](value: string): void
  abstract [emitDefaultValue](): void

  [emitUnsafe](value: string) {
    this.sql += value
  }

  [emitField](fieldApi: FieldApi) {
    fieldApi.toSql().emit(this)
  }

  [emitCreate]({table, ifNotExists}: CreateData<Meta>) {
    const tableApi = getTable(table)
    sql
      .join([
        sql`create table`,
        ifNotExists ? sql`if not exists` : undefined,
        sql.identifier(tableApi.name),
        sql`(${tableApi.createColumns()})`
      ])
      .emit(this)
  }

  [emitColumn](column: ColumnData) {
    sql
      .join([
        column.type,
        column.primary && sql`primary key`,
        column.notNull && sql`not null`,
        column.isUnique && sql`unique`,
        column.autoIncrement && sql`autoincrement`,
        column.defaultValue && sql`default ${column.defaultValue()}`,
        column.references && sql`references ${column.references()}`,
        column.onUpdate && sql`on update ${column.onUpdate}`
      ])
      .emit(this)
  }

  [emitDelete](deleteOp: Delete<unknown>) {
    const {from, where, returning} = getData(deleteOp)
    const table = getTable(from)
    sql
      .query({
        'delete from': sql.identifier(table.name),
        where,
        returning
      })
      .emit(this)
  }

  [emitInsert](insert: Insert<unknown>) {
    const {into, values, returning} = getData(insert)
    const table = getTable(into)
    const tableName = sql.identifier(table.name)
    sql
      .query({
        'insert into': sql`${tableName}(${table.listColumns()})`,
        values,
        returning
      })
      .inlineFields(false)
      .emit(this)
  }

  [emitSelect](select: Select<unknown>) {
    const {from, distinct, where, groupBy, orderBy, having, limit, offset} =
      getData(select)
    const selected = getSelection(select)
    sql
      .query({
        select: distinct ? sql`distinct ${selected}` : selected,
        from,
        where,
        'group by': groupBy,
        'order by': orderBy,
        having,
        limit,
        offset
      })
      .emit(this)
  }

  [emitUnion](union: Union<unknown>) {
    const {left, operator, right} = getData(union)
    sql.join([getQuery(left), operator, getQuery(right)]).emit(this)
  }

  [emitUpdate](update: Update<unknown>) {
    const {table, set, where, returning} = getData(update)
    const tableApi = getTable(table)
    sql
      .query({
        update: sql.identifier(tableApi.name),
        set,
        where,
        returning
      })
      .inlineFields(false)
      .emit(this)
  }
}
