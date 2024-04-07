import {
  type Emitter,
  emitDefaultValue,
  emitField,
  emitIdentifier,
  emitInline,
  emitJsonPath,
  emitPlaceholder,
  emitUnsafe,
  emitValue
} from './Emitter.ts'
import type {FieldApi} from './Field.ts'
import {type HasSql, getSql, internalSql} from './Internal.ts'

type EmitMethods = {
  [K in keyof Emitter as K extends symbol ? K : never]: Emitter[K]
}
type SqlChunk = {
  [K in keyof EmitMethods]: Chunk<K, Parameters<EmitMethods[K]>[0]>
}[keyof EmitMethods]

class Chunk<Type extends keyof Emitter, Inner> {
  constructor(public type: Type, public inner: Inner) {}
}

export type Decoder<T> =
  | ((value: unknown) => T)
  | {mapFromDriverValue?(value: unknown): T}

export class Sql<Value = unknown> implements HasSql<Value> {
  #value?: Value

  alias?: string
  mapFromDriverValue?: (input: unknown) => Value;
  readonly [internalSql] = this

  #chunks: Array<SqlChunk>
  constructor(chunks: Array<SqlChunk> = []) {
    this.#chunks = chunks
  }

  as(name: string): Sql<Value> {
    this.alias = name
    return this
  }

  mapWith<T = Value>(decoder: Decoder<T>): Sql<T> {
    const res: Sql<T> = <any>this
    res.mapFromDriverValue =
      typeof decoder === 'function' ? decoder : decoder.mapFromDriverValue
    return res
  }

  unsafe(sql: string) {
    if (sql.length > 0) this.#chunks.push(new Chunk(emitUnsafe, sql))
    return this
  }

  field(field: FieldApi) {
    this.#chunks.push(new Chunk(emitField, field))
    return this
  }

  add(sql: HasSql) {
    const inner = getSql(sql)
    if (!(inner instanceof Sql)) throw new Error('Invalid SQL')
    this.#chunks.push(...inner.#chunks)
    return this
  }

  value(value: unknown) {
    this.#chunks.push(new Chunk(emitValue, value))
    return this
  }

  inline(value: unknown) {
    this.#chunks.push(new Chunk(emitInline, value))
    return this
  }

  jsonPath(path: Array<string | number>) {
    const last = this.#chunks.at(-1)
    if (last?.type === emitJsonPath) last.inner.push(...path)
    else this.#chunks.push(new Chunk(emitJsonPath, path))
    return this
  }

  placeholder(name: string) {
    this.#chunks.push(new Chunk(emitPlaceholder, name))
    return this
  }

  identifier(identifier: string) {
    this.#chunks.push(new Chunk(emitIdentifier, identifier))
    return this
  }

  defaultValue() {
    this.#chunks.push(new Chunk(emitDefaultValue, undefined))
    return this
  }

  inlineFields(withTableName: boolean) {
    return new Sql(
      this.#chunks.flatMap(chunk => {
        if (chunk.type !== emitField) return [chunk]
        if (withTableName)
          return [
            new Chunk(emitIdentifier, chunk.inner.tableName),
            new Chunk(emitUnsafe, '.'),
            new Chunk(emitIdentifier, chunk.inner.fieldName)
          ]
        return [new Chunk(emitIdentifier, chunk.inner.fieldName)]
      })
    )
  }

  emit(emitter: Emitter) {
    for (const chunk of this.#chunks) emitter[chunk.type](chunk.inner as any)
  }
}

export function sql<T>(
  strings: TemplateStringsArray,
  ...inner: Array<HasSql>
): Sql<T> {
  const sql = new Sql<T>()

  for (let i = 0; i < strings.length; i++) {
    sql.unsafe(strings[i]!)
    if (i < inner.length) {
      const insert = inner[i]!
      sql.add(insert)
    }
  }

  return sql
}

export namespace sql {
  export function empty<T>() {
    return new Sql<T>()
  }

  export function unsafe<T>(directSql: string): Sql<T> {
    return empty<T>().unsafe(directSql)
  }

  export function value<T>(value: T): Sql<T> {
    return empty<T>().value(value)
  }

  export function inline<T>(value: T): Sql<T> {
    return empty<T>().inline(value)
  }

  export function placeholder<T>(name: string): Sql<T> {
    return empty<T>().placeholder(name)
  }

  export function identifier<T>(identifier: string): Sql<T> {
    return empty<T>().identifier(identifier)
  }

  export function defaultValue(): Sql {
    return empty().defaultValue()
  }

  export function field<T>(field: FieldApi): Sql<T> {
    return empty<T>().field(field)
  }

  export function query(ast: Record<string, HasSql | undefined>) {
    return join(
      Object.entries(ast).map(([key, value]) => {
        return value && sql`${sql.unsafe(key)} ${value}`
      })
    )
  }

  export function join<T>(
    items: Array<Sql | HasSql | undefined | false>,
    separator: Sql = sql` `
  ): Sql<T> {
    const parts = items.filter(Boolean) as Array<Sql | HasSql>
    const sql = new Sql<T>()

    for (let i = 0; i < parts.length; i++) {
      if (i > 0) sql.add(separator)
      sql.add(parts[i]!)
    }

    return sql
  }
}
