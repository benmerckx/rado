import {
  HasExpr,
  HasQuery,
  getExpr,
  getQuery,
  hasExpr,
  hasQuery
} from './Meta.ts'

enum ChunkType {
  Unsafe,
  Expr, // Todo: should be field
  Identifier,
  Value,
  Placeholder,
  DefaultValue
}

class Chunk {
  constructor(public type: ChunkType, public inner: unknown) {}
}

class SqlImpl {
  #chunks: Array<Chunk>
  constructor(chunks: Array<Chunk> = []) {
    this.#chunks = chunks
  }

  unsafe(sql: string) {
    this.#chunks.push(new Chunk(ChunkType.Unsafe, sql))
    return this
  }

  add(sql: Sql | HasExpr) {
    if (hasExpr(sql)) this.#chunks.push(new Chunk(ChunkType.Expr, sql))
    else this.#chunks.push(...sql.#chunks)
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

  inline() {
    return this.#chunks
      .map((chunk): string => {
        switch (chunk.type) {
          case ChunkType.Unsafe:
            return chunk.inner as string
          case ChunkType.Expr:
            throw new Error('Should be resolved')
          case ChunkType.Value:
            return JSON.stringify(chunk.inner)
          case ChunkType.Placeholder:
            return `?${chunk.inner}`
          case ChunkType.Identifier:
            return JSON.stringify(chunk.inner)
          case ChunkType.DefaultValue:
            return 'default'
        }
      })
      .join('')
  }
}

export type Sql<T = unknown> = SqlImpl

export function sql<T>(
  strings: TemplateStringsArray,
  ...inner: Array<Sql | HasExpr>
): Sql<T> {
  const sql = new SqlImpl()

  for (let i = 0; i < strings.length; i++) {
    sql.unsafe(strings[i]!)
    if (i < inner.length) sql.add(inner[i]!)
  }

  return sql
}

export namespace sql {
  export function empty() {
    return new SqlImpl()
  }

  export function unsafe<T>(directSql: string): Sql<T> {
    return empty().unsafe(directSql)
  }

  export function value<T>(value: T): Sql<T> {
    return empty().value(value)
  }

  export function placeholder<T>(name: string): Sql<T> {
    return empty().placeholder(name)
  }

  export function identifier<T>(identifier: string): Sql<T> {
    return empty().identifier(identifier)
  }

  export function defaultValue(): Sql<unknown> {
    return empty().defaultValue()
  }

  export function join<T>(
    items: Array<Sql | HasExpr | undefined | false>,
    separator: Sql = sql` `
  ): Sql<T> {
    const parts = items.filter(Boolean) as Array<Sql | HasExpr>
    const sql = new SqlImpl()

    for (let i = 0; i < parts.length; i++) {
      if (i > 0) sql.add(separator)
      sql.add(parts[i]!)
    }

    return sql
  }

  export function inline(input: Sql | HasExpr | HasQuery) {
    const sql: Sql = hasExpr(input)
      ? getExpr(input)({includeTableName: true})
      : hasQuery(input)
      ? getQuery(input)
      : input
    return sql.inline()
  }
}

export function isSql(input: unknown): input is Sql {
  return input instanceof SqlImpl
}
