import type {ColumnData} from './Column.ts'
import type {Runtime} from './MetaData.ts'
import {type Param, ValueParam} from './Param.ts'
import {Sql, sql} from './Sql.ts'
import type {FieldData} from './expr/Field.ts'
import {callFunction} from './expr/Functions.ts'
import type {JsonPath} from './expr/Json.ts'

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

  selfName: string | undefined
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

  emitUniversal(runtimes: Partial<Record<Runtime | 'default', Sql>>) {
    const sql = runtimes[this.#runtime] ?? runtimes.default
    if (!sql) throw new Error('Unsupported runtime')
    sql.emit(this)
  }
}
