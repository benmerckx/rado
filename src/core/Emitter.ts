import type {ColumnData} from './Column.ts'
import {
  type HasQuery,
  type HasTarget,
  getData,
  getQuery,
  getTable,
  getTarget
} from './Internal.ts'
import type {Runtime} from './MetaData.ts'
import {type Param, ValueParam} from './Param.ts'
import {Sql, sql} from './Sql.ts'
import type {TableApi} from './Table.ts'
import type {FieldData} from './expr/Field.ts'
import {callFunction} from './expr/Functions.ts'
import type {IncludeData} from './expr/Include.ts'
import {jsonAggregateArray, jsonArray} from './expr/Json.ts'
import type {Delete} from './query/Delete.ts'
import type {Insert} from './query/Insert.ts'
import type {SelectData} from './query/Select.ts'
import type {UnionData} from './query/Union.ts'
import type {Update} from './query/Update.ts'

export abstract class Emitter {
  sql = ''
  protected params: Array<Param> = []

  get hasParams(): boolean {
    return this.params.length > 0
  }

  bind(inputs?: Record<string, unknown>): Array<unknown> {
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

  abstract runtime: Runtime
  abstract emitIdentifier(value: string): void
  abstract emitValue(value: unknown): void
  abstract emitInline(value: unknown): void
  abstract emitJsonPath(value: Array<number | string>): void
  abstract emitPlaceholder(value: string): void

  emitIdentifierOrSelf(value: string): void {
    if (value === Sql.SELF_TARGET) {
      if (!this.selfName) throw new Error('Self target not defined')
      this.emitIdentifier(this.selfName)
    } else {
      this.emitIdentifier(value)
    }
  }

  selfName?: string
  emitSelf({name, inner}: {name: string; inner: Sql}): void {
    this.selfName = name
    inner.emitTo(this)
    this.selfName = undefined
  }

  emitUnsafe(value: string): void {
    this.sql += value
  }

  emitField({targetName, fieldName}: FieldData): void {
    this.emitIdentifierOrSelf(targetName)
    this.emitUnsafe('.')
    this.emitIdentifier(fieldName)
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
        column.defaultValue && sql`default ${column.defaultValue}`,
        column.references &&
          sql`references ${sql.chunk('emitReferences', [column.references()])}`,
        column.onUpdate && sql`on update ${column.onUpdate}`
      ])
      .emitTo(this)
  }

  emitReferences(fields: Array<FieldData>): void {
    callFunction(
      sql.identifier(fields[0].targetName),
      fields.map(field => sql.identifier(field.fieldName))
    ).emitTo(this)
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

  emitSelect({
    select,
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
  }: SelectData): void {
    if (cte) this.emitWith(cte)
    const prefix = distinctOn
      ? sql`distinct on (${sql.join(distinctOn, sql`, `)})`
      : distinct && sql`distinct`
    sql
      .query({
        select: sql.join([prefix, select]),
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

  emitUnion({left, operator, right}: UnionData): void {
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

  emitWith(cte: {
    recursive: boolean
    definitions: Array<HasQuery & HasTarget>
  }): void {
    sql
      .query({
        [cte.recursive ? 'withRecursive' : 'with']: sql.join(
          cte.definitions.map(cte => {
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

  emitInclude(data: IncludeData) {
    const wrapQuery = Boolean(data.limit || data.offset || data.orderBy)
    const innerQuery = sql.chunk('emitSelect', data)
    const inner = wrapQuery ? sql`select * from (${innerQuery})` : innerQuery
    if (!data.select) throw new Error('No selection defined')
    const fields = data.select.fieldNames()
    const subject = jsonArray(
      ...fields.map(name => sql`_.${sql.identifier(name)}`)
    )
    sql`(select ${
      data.first ? subject : jsonAggregateArray(subject)
    } from (${inner}) as _)`.emitTo(this)
  }

  emitUniversal(runtimes: Partial<Record<Runtime | 'default', Sql>>) {
    const sql = runtimes[this.runtime] ?? runtimes.default
    if (!sql) throw new Error('Unsupported runtime')
    sql.emitTo(this)
  }
}
