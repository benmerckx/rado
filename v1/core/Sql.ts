import type {FieldApi} from './Field.ts'
import {
  getField,
  getQuery,
  getSql,
  hasField,
  hasSql,
  internal,
  type HasField,
  type HasQuery,
  type HasSql
} from './Internal.ts'

enum ChunkType {
  Unsafe = 0,
  Identifier = 1,
  Value = 2,
  Inline = 3,
  JsonPath = 4,
  Placeholder = 5,
  DefaultValue = 6,
  Field = 7
}

class Chunk<Type extends ChunkType, Inner> {
  constructor(public type: Type, public inner: Inner) {}
}

type SqlChunk =
  | Chunk<ChunkType.Unsafe, string>
  | Chunk<ChunkType.Value, unknown>
  | Chunk<ChunkType.Inline, unknown>
  | Chunk<ChunkType.JsonPath, Array<number | string>>
  | Chunk<ChunkType.Placeholder, string>
  | Chunk<ChunkType.Identifier, string>
  | Chunk<ChunkType.DefaultValue, null>
  | Chunk<ChunkType.Field, FieldApi>

export interface SqlEmmiter {
  emitValue(value: unknown): [sql: string, param: unknown]
  emitInline(value: unknown): string
  emitJsonPath(path: Array<number | string>): string
  emitPlaceholder(name: string): string
  emitIdentifier(identifier: string): string
  emitDefaultValue(): string
}

export const testEmitter: SqlEmmiter = {
  emitValue: v => [JSON.stringify(v), []],
  emitInline: JSON.stringify,
  emitJsonPath: path => `->${JSON.stringify(`$.${path.join('.')}`)}`,
  emitIdentifier: JSON.stringify,
  emitPlaceholder: (name: string) => `?${name}`,
  emitDefaultValue: () => 'default'
}

export type Decoder<T> =
  | ((value: unknown) => T)
  | {mapFromDriverValue?(value: unknown): T}

export class Sql<Value = unknown> implements HasSql<Value> {
  #value?: Value

  alias?: string
  mapFromDriverValue?: (input: unknown) => Value;
  readonly [internal.sql] = this

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
    if (sql.length > 0) this.#chunks.push(new Chunk(ChunkType.Unsafe, sql))
    return this
  }

  field(field: FieldApi) {
    this.#chunks.push(new Chunk(ChunkType.Field, field))
    return this
  }

  add(sql: Sql | HasSql) {
    const inner = hasSql(sql) ? getSql(sql) : sql
    if (!isSql(inner)) throw new Error('Invalid SQL')
    this.#chunks.push(...inner.#chunks)
    return this
  }

  value(value: unknown) {
    this.#chunks.push(new Chunk(ChunkType.Value, value))
    return this
  }

  inline(value: unknown) {
    this.#chunks.push(new Chunk(ChunkType.Inline, value))
    return this
  }

  jsonPath(path: Array<string | number>) {
    const last = this.#chunks.at(-1)
    if (last?.type === ChunkType.JsonPath) last.inner.push(...path)
    else this.#chunks.push(new Chunk(ChunkType.JsonPath, path))
    return this
  }

  placeholder(name: string) {
    this.#chunks.push(new Chunk(ChunkType.Placeholder, name))
    return this
  }

  identifier(identifier: string) {
    this.#chunks.push(new Chunk(ChunkType.Identifier, identifier))
    return this
  }

  defaultValue() {
    this.#chunks.push(new Chunk(ChunkType.DefaultValue, null))
    return this
  }

  inlineFields(withTableName: boolean) {
    return new Sql(
      this.#chunks.flatMap(chunk => {
        if (chunk.type !== ChunkType.Field) return [chunk]
        if (withTableName)
          return [
            new Chunk(ChunkType.Identifier, chunk.inner.tableName),
            new Chunk(ChunkType.Unsafe, '.'),
            new Chunk(ChunkType.Identifier, chunk.inner.fieldName)
          ]
        return [new Chunk(ChunkType.Identifier, chunk.inner.fieldName)]
      })
    )
  }

  emit(emitter: SqlEmmiter): [string, Array<unknown>] {
    let sql = ''
    const params = []
    for (const chunk of this.#chunks) {
      switch (chunk.type) {
        case ChunkType.Unsafe:
          sql += chunk.inner
          break
        case ChunkType.Value: {
          const [s, p] = emitter.emitValue(chunk.inner)
          sql += s
          params.push(p)
          break
        }
        case ChunkType.Inline:
          sql += emitter.emitInline(chunk.inner)
          break
        case ChunkType.JsonPath:
          sql += emitter.emitJsonPath(chunk.inner)
          break
        case ChunkType.Placeholder:
          sql += emitter.emitPlaceholder(chunk.inner)
          break
        case ChunkType.Identifier:
          sql += emitter.emitIdentifier(chunk.inner)
          break
        case ChunkType.DefaultValue:
          sql += emitter.emitDefaultValue()
          break
        case ChunkType.Field:
          sql += chunk.inner.toSql().emit(emitter)[0]
          break
      }
    }
    return [sql, params]
  }
}

export type SqlInsert = Sql | HasSql | HasField

export function sql<T>(
  strings: TemplateStringsArray,
  ...inner: Array<SqlInsert>
): Sql<T> {
  const sql = new Sql<T>()

  for (let i = 0; i < strings.length; i++) {
    sql.unsafe(strings[i]!)
    if (i < inner.length) {
      const insert = inner[i]!
      if (hasField(insert)) sql.field(getField(insert))
      else sql.add(insert)
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

  export function test(input: HasSql | HasQuery): string {
    const sql: Sql = hasSql(input) ? getSql(input) : getQuery(input)
    return sql.emit(testEmitter)[0]
  }
}

export function isSql(input: unknown): input is Sql {
  return input instanceof Sql
}
