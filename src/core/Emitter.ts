import type {ColumnData} from './Column.ts'
import type {FieldData} from './Field.ts'
import {getData, getQuery, getSelection, getTable} from './Internal.ts'
import {ValueParam, type Param} from './Param.ts'
import {sql} from './Sql.ts'
import type {Create} from './query/Create.ts'
import type {Delete} from './query/Delete.ts'
import type {Drop} from './query/Drop.ts'
import type {Insert} from './query/Insert.ts'
import type {Select} from './query/Select.ts'
import type {Union} from './query/Union.ts'
import type {Update} from './query/Update.ts'

export abstract class Emitter {
  sql = ''
  params: Array<Param> = []

  bind(inputs?: Record<string, unknown>): Array<unknown> {
    return this.params.map(param => {
      if (param instanceof ValueParam) return param.value
      if (inputs && param.name in inputs) return inputs[param.name]
      throw new Error(`Missing input for named parameter: ${param.name}`)
    })
  }

  abstract emitIdentifier(value: string): void
  abstract emitValue(value: unknown): void
  abstract emitInline(value: unknown): void
  abstract emitJsonPath(value: Array<number | string>): void
  abstract emitPlaceholder(value: string): void
  abstract emitDefaultValue(): void

  emitUnsafe(value: string): void {
    this.sql += value
  }

  emitField(field: FieldData): void {
    this.emitIdentifier(field.targetName)
    this.emitUnsafe('.')
    this.emitIdentifier(field.fieldName)
  }

  emitCreate(create: Create): void {
    const {table, ifNotExists} = getData(create)
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

  emitDrop(drop: Drop): void {
    const {table, ifExists} = getData(drop)
    const tableApi = getTable(table)
    sql
      .join([
        sql`drop table`,
        ifExists ? sql`if exists` : undefined,
        sql.identifier(tableApi.name)
      ])
      .emit(this)
  }

  emitColumn(column: ColumnData): void {
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

  emitDelete(deleteOp: Delete<unknown>): void {
    const {from, where, returning} = getData(deleteOp)
    const table = getTable(from)
    sql
      .query({
        deleteFrom: sql.identifier(table.name),
        where,
        returning
      })
      .emit(this)
  }

  emitInsert(insert: Insert<unknown>): void {
    const {into, values, onConflict, returning} = getData(insert)
    const table = getTable(into)
    const tableName = sql.identifier(table.name)
    sql
      .query({
        insertInto: sql`${tableName}(${table.listColumns()})`,
        values,
        onConflict,
        returning
      })
      .inlineFields(false)
      .emit(this)
  }

  emitSelect(select: Select<unknown>): void {
    const {from, distinct, where, groupBy, orderBy, having, limit, offset} =
      getData(select)
    const selected = getSelection(select)
    sql
      .query({
        select: distinct ? sql`distinct ${selected}` : selected,
        from,
        where,
        groupBy,
        orderBy,
        having,
        limit,
        offset
      })
      .emit(this)
  }

  emitUnion(union: Union<unknown>): void {
    const {left, operator, right} = getData(union)
    sql.join([getQuery(left), operator, getQuery(right)]).emit(this)
  }

  emitUpdate(update: Update<unknown>): void {
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

  abstract emitIdColumn(): void
}
