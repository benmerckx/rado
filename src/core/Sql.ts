import type {DriverSpecs} from './Driver.ts'
import type {Emitter} from './Emitter.ts'
import {type HasValue, get, internal} from './Internal.ts'
import type {Runtime} from './MetaData.ts'
import type {FieldData} from './expr/Field.ts'
import type {JsonPath} from './expr/Json.ts'

export type Decoder<T = unknown> =
  | ((value: unknown) => T)
  | {mapFromDriverValue?(value: unknown, specs: DriverSpecs): T}

const noop = () => {}

export class Sql<Value = unknown> implements HasValue<Value> {
  static SELF_TARGET = '$$self'
  private declare brand: [Value]
  alias?: string
  mapFromDriverValue?: (input: unknown, specs: DriverSpecs) => Value
  readonly [internal]: {value: Sql<Value>}

  constructor(public emit: (emitter: Emitter) => void = noop) {
    this[internal] = {value: this}
  }

  as(name: string): Sql<Value> {
    this.alias = name
    return this
  }

  mapWith<T = Value>(decoder: Decoder<T>): Sql<T> {
    const res: Sql<T> = <any>this
    res.mapFromDriverValue =
      typeof decoder === 'function'
        ? input => (input === null ? null! : decoder(input))
        : decoder.mapFromDriverValue
    return res
  }

  inlineFields(withTableName: boolean): Sql<Value> {
    return new Sql(emitter => emitter.inlineFields(this, withTableName))
  }

  inlineValues(): Sql<Value> {
    return new Sql(emitter => emitter.inlineValues(this))
  }

  nameSelf(name: string): Sql<Value> {
    return new Sql(emitter => emitter.emitSelf(this, name))
  }

  forSelection(): Sql<Value> {
    return this
  }

  if(condition: unknown): Sql<Value> | undefined {
    return condition ? this : undefined
  }
}

class JsonPathSql<T> extends Sql<T> {
  constructor(public path: JsonPath) {
    super(emitter => emitter.emitJsonPath(path))
  }

  forSelection() {
    return sql.jsonPath({...this.path, asSql: false}).mapWith(this)
  }
}

export function sql<T>(
  strings: TemplateStringsArray,
  ...inner: Array<HasValue | unknown>
): Sql<T> {
  return new Sql<T>(emitter => {
    for (let i = 0; i < strings.length; i++) {
      emitter.emitUnsafe(strings[i]!)
      if (i < inner.length) {
        const insert = inner[i]
        if (insert === undefined) continue
        const isObject = insert !== null && typeof insert === 'object'
        if (!isObject) emitter.emitValueOrInline(insert)
        else {
          const {value, target} = get(insert)
          if (value) value.emit(emitter)
          else if (target) target.emit(emitter)
          else emitter.emitValueOrInline(insert)
        }
      }
    }
  })
}

export namespace sql {
  export function empty<T>(): Sql<T> {
    return new Sql()
  }

  export function unsafe<T>(directSql: string | number): Sql<T> {
    return new Sql(emitter => emitter.emitUnsafe(String(directSql)))
  }

  export function value<T>(value: T): Sql<T> {
    return new Sql(emitter => emitter.emitValueOrInline(value))
  }

  export function inline<T>(value: T): Sql<T> {
    return new Sql(emitter => emitter.emitInline(value))
  }

  export function placeholder<T>(name: string): Sql<T> {
    return new Sql(emitter => emitter.emitPlaceholder(name))
  }

  export function identifier<T>(identifier: string): Sql<T> {
    return new Sql(emitter => emitter.emitIdentifierOrSelf(identifier))
  }

  export function field<T>(field: FieldData): Sql<T> {
    return new Sql(emitter => emitter.emitField(field))
  }

  export function jsonPath<T>(path: JsonPath): Sql<T> {
    if (path.target instanceof JsonPathSql) {
      const inner = path.target.path
      return new JsonPathSql({
        ...inner,
        segments: [...inner.segments, ...path.segments]
      })
    }
    return new JsonPathSql(path)
  }

  export function universal<T>(
    runtimes: Partial<Record<Runtime | 'default', HasValue<T>>>
  ): Sql<T> {
    return new Sql(emitter => emitter.emitUniversal(runtimes))
  }

  type QueryChunk = HasValue | undefined
  export function query(
    ...chunks: Array<
      QueryChunk | Record<string, boolean | QueryChunk | Array<QueryChunk>>
    >
  ): Sql {
    return join(
      chunks.filter(Boolean).flatMap(chunk => {
        const {value} = get(chunk!)
        if (value) return chunk
        return Object.entries(chunk!).map(([key, value]) => {
          const statement = key.replace(/([A-Z])/g, ' $1').toLowerCase()
          if (value === true) return sql.unsafe(statement)
          if (Array.isArray(value)) value = join(value)
          if (!key) return value
          return value && sql`${sql.unsafe(statement)} ${value}`
        })
      })
    )
  }

  export function join<T>(
    items: Array<Sql | HasValue | undefined | false>,
    separator: Sql = sql` `
  ): Sql<T> {
    const parts = items.filter(Boolean) as Array<Sql | HasValue>
    return new Sql(emitter => {
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) separator.emit(emitter)
        get(parts[i]).value.emit(emitter)
      }
    })
  }
}
