import type {FieldData} from './expr/Field.ts'
import type {JsonPath} from './expr/Json.ts'
import {type HasSql, getSql} from './Internal.ts'
import type {Runtime} from './MetaData.ts'
import {type Param, ValueParam} from './Param.ts'
import {Sql} from './Sql.ts'

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

  #selfNames = new Map<string, string>()
  emitIdentifierOrSelf(value: string): void {
    if (value === Sql.SELF_TARGET) {
      if (!this.#selfName) throw new Error('Self target not defined')
      this.emitIdentifier(this.#selfName)
    } else {
      this.emitIdentifier(value)
    }
  }

  emitUnsafe(value: string): void {
    this.sql += value
  }

  #selfName: string | undefined
  emitSelf(
    inner: Sql,
    name: string,
    sourceName = Sql.SELF_TARGET,
    selfName = name
  ): void {
    const previousSelfName = this.#selfName
    const previousSourceName = this.#selfNames.get(sourceName)
    this.#selfName = selfName
    this.#selfNames.set(sourceName, name)
    inner.emit(this)
    this.#selfName = previousSelfName
    if (previousSourceName) this.#selfNames.set(sourceName, previousSourceName)
    else this.#selfNames.delete(sourceName)
  }

  #inlineFields = false
  inlineFields(inner: Sql, withTableName: boolean): void {
    const previous = this.#inlineFields
    this.#inlineFields = !withTableName
    inner.emit(this)
    this.#inlineFields = previous
  }

  #inlineValues = false
  inlineValues(inner: Sql): void {
    const previous = this.#inlineValues
    this.#inlineValues = true
    inner.emit(this)
    this.#inlineValues = previous
  }

  emitField({targetName, fieldName}: FieldData): void {
    if (this.#inlineFields) return this.emitIdentifier(fieldName)
    const selfName = this.#selfNames.get(targetName)
    if (selfName) this.emitIdentifier(selfName)
    else this.emitIdentifierOrSelf(targetName)
    this.emitUnsafe('.')
    this.emitIdentifier(fieldName)
  }

  emitValueOrInline(value: unknown): void {
    if (this.#inlineValues) this.emitInline(value)
    else this.emitValue(value)
  }

  emitUniversal(runtimes: Partial<Record<Runtime | 'default', HasSql>>) {
    const sql = runtimes[this.#runtime] ?? runtimes.default
    if (!sql) throw new Error('Unsupported runtime')
    getSql(sql).emit(this)
  }
}
