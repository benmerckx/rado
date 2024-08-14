import type {DriverSpecs} from './Driver.ts'
import type {Emitter} from './Emitter.ts'
import {type HasSql, getSql, internalSql} from './Internal.ts'
import type {Runtime} from './MetaData.ts'
import type {FieldData} from './expr/Field.ts'

type EmitMethods = {
  [K in keyof Emitter as K extends `emit${string}` ? K : never]: Emitter[K]
}

export type Decoder<T> =
  | ((value: unknown) => T)
  | {mapFromDriverValue?(value: unknown, specs: DriverSpecs): T}

export class Sql<Value = unknown> implements HasSql<Value> {
  static SELF_TARGET = '$$self'
  private declare brand: [Value]
  alias?: string
  mapFromDriverValue?: (input: unknown, specs: DriverSpecs) => Value
  readonly [internalSql] = this

  #chunks: Array<unknown>
  constructor(chunks: Array<unknown> = []) {
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
    this.#chunks.push(type, inner)
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

  getValue(): Value | undefined {
    if (this.#chunks.length !== 2) return
    const [type, inner] = this.#chunks
    if (type === 'emitValue') return <Value>inner
  }

  inline(value: unknown): Sql<Value> {
    return this.chunk('emitInline', value)
  }

  jsonPath(path: Array<string | number>): Sql<Value> {
    const [type, inner] = this.#chunks.slice(-2)
    if (type === 'emitJsonPath') (<Array<string | number>>inner).push(...path)
    else this.chunk('emitJsonPath', path)
    return this
  }

  placeholder(name: string): Sql<Value> {
    return this.chunk('emitPlaceholder', name)
  }

  identifier(identifier: string): Sql<Value> {
    return this.chunk('emitIdentifierOrSelf', identifier)
  }

  inlineValues(): Sql<Value> {
    const chunks = []
    for (let i = 0; i < this.#chunks.length; i += 2) {
      const type = this.#chunks[i]
      if (type !== 'emitValue') chunks.push(type, this.#chunks[i + 1])
      else chunks.push('emitInline', this.#chunks[i + 1])
    }
    return new Sql(chunks)
  }

  inlineFields(withTableName: boolean): Sql<Value> {
    const chunks = []
    for (let i = 0; i < this.#chunks.length; i += 2) {
      const type = this.#chunks[i]
      if (type !== 'emitField') {
        chunks.push(type, this.#chunks[i + 1])
      } else {
        const inner = <FieldData>this.#chunks[i + 1]
        if (withTableName)
          chunks.push(
            'emitIdentifierOrSelf',
            inner.targetName,
            'emitUnsafe',
            '.',
            'emitIdentifier',
            inner.fieldName
          )
        else chunks.push('emitIdentifier', inner.fieldName)
      }
    }
    return new Sql(chunks)
  }

  nameSelf(name: string): Sql {
    return sql.chunk('emitSelf', {name, inner: this})
  }

  emitTo(emitter: Emitter): void {
    for (let i = 0; i < this.#chunks.length; i += 2) {
      const type = this.#chunks[i]
      const inner = this.#chunks[i + 1]
      emitter[type as keyof EmitMethods](<any>inner)
    }
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

  export function universal<T>(
    runtimes: Partial<Record<Runtime | 'default', Sql<T>>>
  ): Sql<T> {
    return empty<T>().chunk('emitUniversal', runtimes)
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
