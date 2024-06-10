import type {ColumnData} from './Column.ts'
import {
  getData,
  getQuery,
  getSelection,
  getTable,
  getTarget,
  type HasQuery,
  type HasTarget
} from './Internal.ts'
import {ValueParam, type Param} from './Param.ts'
import {sql} from './Sql.ts'
import type {TableApi} from './Table.ts'
import type {FieldData} from './expr/Field.ts'
import type {Delete} from './query/Delete.ts'
import type {Insert} from './query/Insert.ts'
import type {Select} from './query/Select.ts'
import type {Union} from './query/Union.ts'
import type {Update} from './query/Update.ts'

export abstract class Emitter {
  sql = ''
  protected params: Array<Param> = []

  get hasParams() {
    return this.params.length > 0
  }

  bind(inputs?: Record<string, unknown>) {
    return this.params.map(param => {
      if (param instanceof ValueParam) return this.processValue(param.value)
      if (inputs && param.name in inputs)
        return this.processValue(inputs[param.name])
      throw new Error(`Missing input for named parameter: ${param.name}`)
    })
  }

  processValue(value: unknown): unknown {
    return value
  }

  abstract emitIdentifier(value: string): void
  abstract emitValue(value: unknown): void
  abstract emitInline(value: unknown): void
  abstract emitJsonPath(value: Array<number | string>): void
  abstract emitPlaceholder(value: string): void
  abstract emitDefaultValue(): void
  abstract emitLastInsertId(): void
  abstract emitIdColumn(): void

  emitUnsafe(value: string): void {
    this.sql += value
  }

  emitField(field: FieldData): void {
    this.emitIdentifier(field.targetName)
    this.emitUnsafe('.')
    this.emitIdentifier(field.fieldName)
  }

  emitCreateTable(tableApi: TableApi): void {
    sql
      .join([
        sql`create table`,
        //ifNotExists ? sql`if not exists` : undefined,
        tableApi.target(),
        sql`(${tableApi.createDefinition()})`
      ])
      .emitTo(this)
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
        column.references &&
          sql`references ${sql.chunk('emitReferences', [column.references()])}`,
        column.onUpdate && sql`on update ${column.onUpdate}`
      ])
      .emitTo(this)
  }

  emitReferences(fields: Array<FieldData>): void {
    sql
      .join([
        sql.identifier(fields[0].targetName),
        sql`(${sql.join(
          fields.map(field => sql.identifier(field.fieldName)),
          sql`, `
        )})`
      ])
      .emitTo(this)
  }

  emitDelete(deleteOp: Delete<unknown>): void {
    const {cte, from, where, returning} = getData(deleteOp)
    if (cte) this.emitWith(cte)
    const table = getTable(from)
    sql
      .query({
        deleteFrom: sql.identifier(table.name),
        where,
        returning
      })
      .emitTo(this)
  }

  emitInsert(insert: Insert<unknown>): void {
    const {cte, into, values, select, onConflict, returning} = getData(insert)
    if (cte) this.emitWith(cte)
    const table = getTable(into)
    const tableName = sql.identifier(table.name)
    sql
      .query({
        insertInto: sql`${tableName}(${table.listColumns()})`,
        ...(values ? {values} : {'': select}),
        onConflict,
        returning
      })
      .inlineFields(false)
      .emitTo(this)
  }

  emitSelect(select: Select<unknown>): void {
    const {
      cte,
      from,
      distinct,
      distinctOn,
      where,
      groupBy,
      orderBy,
      having,
      limit,
      offset
    } = getData(select)
    if (cte) this.emitWith(cte)
    const selected = getSelection(select)
    const prefix = distinctOn
      ? sql`distinct on (${sql.join(distinctOn, sql`, `)})`
      : distinct && sql`distinct`
    sql
      .query({
        select: sql.join([prefix, selected]),
        from,
        where,
        groupBy,
        orderBy,
        having,
        limit,
        offset
      })
      .emitTo(this)
  }

  emitUnion(union: Union<unknown>): void {
    const {left, operator, right} = getData(union)
    sql.join([getQuery(left), operator, getQuery(right)]).emitTo(this)
  }

  emitUpdate(update: Update<unknown>): void {
    const {cte, table, set, where, returning} = getData(update)
    const tableApi = getTable(table)
    if (cte) this.emitWith(cte)
    sql
      .query({
        update: sql.identifier(tableApi.name),
        set,
        where,
        returning
      })
      .inlineFields(false)
      .emitTo(this)
  }

  emitWith(cte: Array<HasQuery & HasTarget>): void {
    sql
      .query({
        with: sql.join(
          cte.map(cte => {
            const query = getQuery(cte)
            const target = getTarget(cte)
            return sql`${target} as (${query})`
          }),
          sql`, `
        )
      })
      .add(sql` `)
      .emitTo(this)
  }
}
