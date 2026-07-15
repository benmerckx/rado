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
  emitSelf(inner: Sql, name: string): void {
    const previous = this.#selfName
    this.#selfName = name
    try {
      inner.emit(this)
    } finally {
      this.#selfName = previous
    }
  }

  #targetNames = new Map<string, string>()

  #resolveTarget(name: string): string {
    const seen = new Set<string>()
    let current = name
    while (!seen.has(current)) {
      seen.add(current)
      if (current === Sql.SELF_TARGET) {
        if (!this.#selfName) throw new Error('Self target not defined')
        return this.#selfName
      }
      const mapped = this.#targetNames.get(current)
      if (!mapped || mapped === current) return current
      current = mapped
    }
    return current
  }

  scopeTarget(
    inner: Sql,
    sourceName: string,
    name: string,
    selfName = sourceName
  ): void {
    const previousSelfName = this.#selfName
    const previousName = this.#targetNames.get(sourceName)
    this.#selfName = this.#resolveTarget(selfName)
    this.#targetNames.set(sourceName, name)
    try {
      inner.emit(this)
    } finally {
      this.#selfName = previousSelfName
      if (previousName === undefined) this.#targetNames.delete(sourceName)
      else this.#targetNames.set(sourceName, previousName)
    }
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
    this.emitIdentifier(this.#resolveTarget(targetName))
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
