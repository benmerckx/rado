import type {ColumnData} from './Column.ts'
import {getData, getQuery, getTable, getTarget} from './Internal.ts'
import type {Runtime} from './MetaData.ts'
import {type Param, ValueParam} from './Param.ts'
import {Sql, sql} from './Sql.ts'
import type {TableApi} from './Table.ts'
import type {FieldData} from './expr/Field.ts'
import {callFunction} from './expr/Functions.ts'
import type {IncludeData} from './expr/Include.ts'
import {type JsonPath, jsonAggregateArray, jsonArray} from './expr/Json.ts'
import type {Delete} from './query/Delete.ts'
import type {Insert} from './query/Insert.ts'
import type {CTEBase, SelectQuery} from './query/Query.ts'
import type {UnionData} from './query/Union.ts'
import type {Update} from './query/Update.ts'

export abstract class Emitter {
  #runtime: Runtime
  sql = ''
  protected params: Array<Param> = []

  abstract emitIdentifier(value: string): void
  abstract emitValue(value: unknown): void
  abstract emitInline(value: unknown): void
  abstract emitJsonPath(path: JsonPath): void
  abstract emitPlaceholder(value: string): void

  constructor(runtime: Runtime) {
    this.#runtime = runtime
  }

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
    inner.emit(this)
    this.selfName = undefined
  }

  emitUnsafe(value: string): void {
    this.sql += value
  }

  inlineFields = false
  emitField({targetName, fieldName}: FieldData): void {
    if (this.inlineFields) return this.emitIdentifier(fieldName)
    this.emitIdentifierOrSelf(targetName)
    this.emitUnsafe('.')
    this.emitIdentifier(fieldName)
  }

  inlineValues = false
  emitValueOrInline(value: unknown): void {
    if (this.inlineValues) this.emitInline(value)
    else this.emitValue(value)
  }

  emitCreateTable(tableApi: TableApi): void {
    sql
      .join([
        sql`create table`,
        //ifNotExists ? sql`if not exists` : undefined,
        tableApi.target(),
        sql`(${tableApi.createDefinition()})`
      ])
      .emit(this)
  }

  emitColumn(column: ColumnData): void {
    const references =
      column.references &&
      sql`references ${new Sql(emitter => emitter.emitReferences([column.references!()]))}`
    sql
      .join([
        column.type,
        column.primary && sql`primary key`,
        column.notNull && sql`not null`,
        column.isUnique && sql`unique`,
        column.autoIncrement && sql`autoincrement`,
        column.defaultValue && sql`default ${column.defaultValue}`,
        references,
        column.onUpdate && sql`on update ${column.onUpdate}`
      ])
      .emit(this)
  }

  emitReferences(fields: Array<FieldData>): void {
    callFunction(
      sql.identifier(fields[0].targetName),
      fields.map(field => sql.identifier(field.fieldName))
    ).emit(this)
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
      .emit(this)
  }

  emitInsert(insert: Insert<unknown>): void {
    const {
      cte,
      into,
      values,
      select,
      onConflict,
      onDuplicateKeyUpdate,
      returning
    } = getData(insert)
    if (cte) this.emitWith(cte)
    const table = getTable(into)
    const tableName = sql.identifier(table.name)
    sql
      .query({
        insertInto: sql`${tableName}(${table.listColumns()})`,
        ...(values ? {values} : {'': select}),
        onConflict,
        onDuplicateKeyUpdate,
        returning
      })
      .inlineFields(false)
      .emit(this)
  }

  emitSelect(query: SelectQuery<unknown>): void {
    const {
      select,
      from,
      distinct,
      distinctOn,
      where,
      groupBy,
      orderBy,
      having,
      limit,
      offset
    } = query
    this.emitWith(query)
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
      .emit(this)
  }

  emitUnion({left, operator, right}: UnionData): void {
    sql.join([getQuery(left), operator, getQuery(right)]).emit(this)
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
      .emit(this)
  }

  emitWith(cte: CTEBase): void {
    const isRecursive = cte.withRecursive
    const definitions = isRecursive ? cte.withRecursive : cte.with
    if (!definitions) return
    sql
      .query({
        [isRecursive ? 'withRecursive' : 'with']: sql.join(
          definitions.map(cte => {
            const query = getQuery(cte)
            const target = getTarget(cte)
            return sql`${target} as (${query})`
          }),
          sql`, `
        )
      })
      .emit(this)
    sql` `.emit(this)
  }

  emitInclude(data: IncludeData) {
    const wrapQuery = Boolean(data.limit || data.offset || data.orderBy)
    const innerQuery = new Sql(emitter => emitter.emitSelect(data))
    const inner = wrapQuery ? sql`select * from (${innerQuery})` : innerQuery
    if (!data.select) throw new Error('No selection defined')
    const fields = data.select.fieldNames()
    const subject = jsonArray(
      ...fields.map(name => sql`_.${sql.identifier(name)}`)
    )
    sql`(select ${
      data.first ? subject : jsonAggregateArray(subject)
    } from (${inner}) as _)`.emit(this)
  }

  emitUniversal(runtimes: Partial<Record<Runtime | 'default', Sql>>) {
    const sql = runtimes[this.#runtime] ?? runtimes.default
    if (!sql) throw new Error('Unsupported runtime')
    sql.emit(this)
  }
}
