import type {DriverSpecs} from './Driver.ts'
import type {Emitter} from './Emitter.ts'
import {type HasSql, getSql, hasSql, internalSql} from './Internal.ts'
import type {Runtime} from './MetaData.ts'
import type {FieldData} from './expr/Field.ts'
import type {JsonPath} from './expr/Json.ts'

export type Decoder<T> =
  | ((value: unknown) => T)
  | {mapFromDriverValue?(value: unknown, specs: DriverSpecs): T}

const noop = () => {}

export class Sql<Value = unknown> implements HasSql<Value> {
  static SELF_TARGET = '$$self'
  private declare brand: [Value]
  alias?: string
  mapFromDriverValue?: (input: unknown, specs: DriverSpecs) => Value
  readonly [internalSql] = this

  constructor(public emit: (emitter: Emitter) => void = noop) {}

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
  ...inner: Array<HasSql | unknown>
): Sql<T> {
  return new Sql<T>(emitter => {
    for (let i = 0; i < strings.length; i++) {
      emitter.emitUnsafe(strings[i]!)
      if (i < inner.length) {
        const insert = inner[i]
        if (insert !== null && typeof insert === 'object' && hasSql(insert))
          getSql(insert).emit(emitter)
        else emitter.emitValueOrInline(insert)
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
    runtimes: Partial<Record<Runtime | 'default', Sql<T>>>
  ): Sql<T> {
    return new Sql(emitter => emitter.emitUniversal(runtimes))
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
    return new Sql(emitter => {
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) separator.emit(emitter)
        getSql(parts[i]).emit(emitter)
      }
    })
  }
}
