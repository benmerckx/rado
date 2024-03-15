import {Is, type IsSql} from './Is.ts'

enum ChunkType {
  Unsafe = 0,
  Value = 1,
  Placeholder = 2,
  Identifier = 3
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

  add(sql: Sql) {
    this.#chunks.push(...sql.#chunks)
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

  inline() {
    return this.#chunks
      .map(chunk => {
        switch (chunk.type) {
          case ChunkType.Unsafe:
            return chunk.inner
          case ChunkType.Value:
            return JSON.stringify(chunk.inner)
          case ChunkType.Placeholder:
            return `?${chunk.inner}`
          case ChunkType.Identifier:
            return JSON.stringify(chunk.inner)
        }
      })
      .join('')
  }
}

export type Sql = SqlImpl

export class TypedSql<T> implements IsSql {
  readonly [Is.sql]: Sql
  constructor(sql: Sql) {
    this[Is.sql] = sql
  }
}

export class ContainsSql implements IsSql {
  readonly [Is.sql]: Sql
  constructor(sql: IsSql) {
    this[Is.sql] = sql[Is.sql]
  }
}

export function sql<T>(strings: TemplateStringsArray, ...inner: Array<IsSql>) {
  const sql = new SqlImpl()

  for (let i = 0; i < strings.length; i++) {
    sql.unsafe(strings[i])
    if (i < inner.length) {
      sql.add(inner[i][Is.sql])
    }
  }

  return new TypedSql<T>(sql)
}

export namespace sql {
  export function unsafe<T>(directSql: string) {
    return new TypedSql<T>(new SqlImpl().unsafe(directSql))
  }

  export function value<T>(value: T) {
    return new TypedSql<T>(new SqlImpl().value(value))
  }

  export function placeholder<T>(name: string) {
    return new TypedSql<T>(new SqlImpl().placeholder(name))
  }

  export function identifier<T>(identifier: string) {
    return new TypedSql<T>(new SqlImpl().identifier(identifier))
  }

  export function join<T>(
    items: Array<IsSql | undefined | false>,
    separator: IsSql = unsafe(' ')
  ) {
    const parts = items.filter(Boolean) as Array<IsSql>
    const sql = new SqlImpl()

    for (let i = 0; i < parts.length; i++) {
      if (i > 0) sql.add(separator[Is.sql])
      sql.add(parts[i][Is.sql])
    }

    return new TypedSql<T>(sql)
  }

  export function inline(hasSql: IsSql) {
    return hasSql[Is.sql].inline()
  }
}
