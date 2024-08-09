import type {DriverSpecs} from './Driver.ts'
import type {Emitter} from './Emitter.ts'
import {type HasSql, getSql, internalSql} from './Internal.ts'
import type {Runtime} from './MetaData.ts'
import type {FieldData} from './expr/Field.ts'

type EmitMethods = {
  [K in keyof Emitter as K extends `emit${string}` ? K : never]: Emitter[K]
}
/*type SqlChunk = {
  [K in keyof EmitMethods]: Chunk<K, Parameters<EmitMethods[K]>[0]>
}[keyof EmitMethods]*/

class Chunk<Type = keyof EmitMethods, Inner = unknown> {
  constructor(
    public type: Type,
    public inner: Inner
  ) {}
}

export type Decoder<T> =
  | ((value: unknown) => T)
  | {mapFromDriverValue?(value: unknown, specs: DriverSpecs): T}

export class Sql<Value = unknown> implements HasSql<Value> {
  private declare brand: [Value]
  alias?: string
  mapFromDriverValue?: (input: unknown, specs: DriverSpecs) => Value
  readonly [internalSql] = this

  #chunks: Array<Chunk>
  constructor(chunks: Array<Chunk> = []) {
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

  chunk<Type extends keyof EmitMethods>(
    type: Type,
    inner: Parameters<EmitMethods[Type]>[0]
  ): Sql<Value> {
    this.#chunks.push(new Chunk(type, inner))
    return this
  }

  unsafe(sql: string): Sql<Value> {
    if (sql.length > 0) this.chunk('emitUnsafe', sql)
    return this
  }

  field(field: FieldData): Sql<Value> {
    return this.chunk('emitField', field)
  }

  add(sql: HasSql): Sql<Value> {
    const inner = getSql(sql)
    if (!(inner instanceof Sql)) throw new Error('Invalid SQL')
    this.#chunks.push(...inner.#chunks)
    return this
  }

  value(value: unknown): Sql<Value> {
    return this.chunk('emitValue', value)
  }

  inline(value: unknown): Sql<Value> {
    return this.chunk('emitInline', value)
  }

  jsonPath(path: Array<string | number>): Sql<Value> {
    const last = this.#chunks.at(-1)
    if (last?.type === 'emitJsonPath')
      (<Array<string | number>>last.inner).push(...path)
    else this.chunk('emitJsonPath', path)
    return this
  }

  placeholder(name: string): Sql<Value> {
    return this.chunk('emitPlaceholder', name)
  }

  identifier(identifier: string): Sql<Value> {
    return this.chunk('emitIdentifier', identifier)
  }

  inlineValues(): Sql<Value> {
    return new Sql(
      this.#chunks.map(chunk => {
        if (chunk.type !== 'emitValue') return chunk
        return new Chunk('emitInline', chunk.inner as unknown)
      })
    )
  }

  inlineFields(withTableName: boolean): Sql<Value> {
    return new Sql(
      this.#chunks.flatMap(chunk => {
        if (chunk.type !== 'emitField') return [chunk]
        const data = <FieldData>chunk.inner
        if (withTableName)
          return [
            new Chunk('emitIdentifier', data.targetName),
            new Chunk('emitUnsafe', '.'),
            new Chunk('emitIdentifier', data.fieldName)
          ]
        return [new Chunk('emitIdentifier', data.fieldName)]
      })
    )
  }

  emitTo(emitter: Emitter): void {
    for (const chunk of this.#chunks) emitter[chunk.type](<any>chunk.inner)
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
  export function empty<T>(): Sql<T> {
    return new Sql<T>()
  }

  export function unsafe<T>(directSql: string | number): Sql<T> {
    return empty<T>().unsafe(String(directSql))
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

  export function field<T>(field: FieldData): Sql<T> {
    return empty<T>().field(field)
  }

  export function chunk<Type extends keyof EmitMethods>(
    type: Type,
    inner: Parameters<EmitMethods[Type]>[0]
  ): Sql {
    return empty().chunk(type, inner)
  }

  export function universal(
    runtimes: Partial<Record<Runtime | 'default', Sql>>
  ): Sql {
    return chunk('emitUniversal', runtimes)
  }

  type QueryChunk = HasSql | undefined
  export function query(
    ast: Record<string, boolean | QueryChunk | Array<QueryChunk>>
  ): Sql {
    return join(
      Object.entries(ast).map(([key, value]) => {
        const statement = key.replace(/([A-Z])/g, ' $1').toLocaleLowerCase()
        if (value === true) return sql.unsafe(statement)
        if (Array.isArray(value)) value = join(value)
        if (!key) return value
        return value && sql`${sql.unsafe(statement)} ${value}`
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
