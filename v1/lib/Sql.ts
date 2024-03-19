import {
  getExpr,
  getField,
  getQuery,
  hasExpr,
  hasField,
  hasQuery,
  type HasExpr,
  type HasField,
  type HasQuery
} from './Meta.ts'
import type {FieldApi} from './Table.ts'

enum ChunkType {
  Unsafe = 0,
  Identifier = 1,
  Value = 2,
  Placeholder = 3,
  DefaultValue = 4,
  Field = 5
}

class Chunk<Type extends ChunkType, Inner> {
  constructor(public type: Type, public inner: Inner) {}
}

type SqlChunk =
  | Chunk<ChunkType.Unsafe, string>
  | Chunk<ChunkType.Value, unknown>
  | Chunk<ChunkType.Placeholder, string>
  | Chunk<ChunkType.Identifier, string>
  | Chunk<ChunkType.DefaultValue, null>
  | Chunk<ChunkType.Field, FieldApi>

export interface SqlEmmiter {
  emitValue(value: unknown): [sql: string, params: Array<unknown>]
  emitPlaceholder(name: string): string
  emitIdentifier(identifier: string): string
  emitDefaultValue(): string
}

export const testEmitter: SqlEmmiter = {
  emitValue: v => [JSON.stringify(v), []],
  emitIdentifier: JSON.stringify,
  emitPlaceholder: (name: string) => `?${name}`,
  emitDefaultValue: () => 'default'
}

export class Sql<T = unknown> {
  #brand?: T

  #chunks: Array<SqlChunk>
  constructor(chunks: Array<SqlChunk> = []) {
    this.#chunks = chunks
  }

  unsafe(sql: string) {
    this.#chunks.push(new Chunk(ChunkType.Unsafe, sql))
    return this
  }

  field(field: FieldApi) {
    this.#chunks.push(new Chunk(ChunkType.Field, field))
    return this
  }

  add(sql: Sql | HasExpr) {
    const inner = hasExpr(sql) ? getExpr(sql) : sql
    this.#chunks.push(...inner.#chunks)
    return this
  }

  value(value: unknown) {
    this.#chunks.push(new Chunk(ChunkType.Value, value))
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
          params.push(...p)
          break
        }
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

export type SqlInsert = Sql | HasExpr | HasField

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

  export function placeholder<T>(name: string): Sql<T> {
    return empty<T>().placeholder(name)
  }

  export function identifier<T>(identifier: string): Sql<T> {
    return empty<T>().identifier(identifier)
  }

  export function defaultValue(): Sql {
    return empty().defaultValue()
  }

  export function field(field: FieldApi): Sql {
    return empty().field(field)
  }

  export function join<T>(
    items: Array<Sql | HasExpr | undefined | false>,
    separator: Sql = sql` `
  ): Sql<T> {
    const parts = items.filter(Boolean) as Array<Sql | HasExpr>
    const sql = new Sql<T>()

    for (let i = 0; i < parts.length; i++) {
      if (i > 0) sql.add(separator)
      sql.add(parts[i]!)
    }

    return sql
  }

  export function inline(input: Sql | HasExpr | HasQuery): string {
    const sql: Sql = hasExpr(input)
      ? getExpr(input)
      : hasQuery(input)
      ? getQuery(input)
      : input
    return sql.emit(testEmitter)[0]
  }
}

export function isSql(input: unknown): input is Sql {
  return input instanceof Sql
}
