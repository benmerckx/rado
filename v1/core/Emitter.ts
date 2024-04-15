import type {FieldApi} from './Field.ts'
import {getQuery, getTable} from './Internal.ts'
import type {QueryMeta} from './MetaData.ts'
import {type Param, ValueParam} from './Param.ts'
import {selection} from './Selection.ts'
import {sql} from './Sql.ts'
import type {CreateData} from './query/Create.ts'
import type {DeleteData} from './query/Delete.ts'
import type {InsertData} from './query/Insert.ts'
import type {SelectData} from './query/Select.ts'
import type {UnionData} from './query/Union.ts'
import type {UpdateData} from './query/Update.ts'

export const emitUnsafe = Symbol()
export const emitIdentifier = Symbol()
export const emitValue = Symbol()
export const emitInline = Symbol()
export const emitJsonPath = Symbol()
export const emitPlaceholder = Symbol()
export const emitDefaultValue = Symbol()
export const emitField = Symbol()

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

  [emitDelete]({from, where, returning}: DeleteData<Meta>) {
    const table = getTable(from)
    sql
      .query({
        'delete from': sql.identifier(table.name),
        where,
        returning
      })
      .emit(this)
  }

  [emitInsert]({into, values, returning}: InsertData<Meta>) {
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

  [emitSelect]({
    select,
    distinct,
    from,
    where,
    groupBy,
    having,
    orderBy,
    limit,
    offset
  }: SelectData<Meta>) {
    const selected = selection(select.input!, new Set(select.nullable))
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

  [emitUnion]({left, operator, right}: UnionData<Meta>) {
    sql.join([getQuery(left), operator, getQuery(right)]).emit(this)
  }

  [emitUpdate]({table, set, where, returning}: UpdateData<Meta>) {
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
