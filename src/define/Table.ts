import {Column, ColumnData, OptionalColumn, PrimaryColumn} from './Column'
import {Cursor} from './Cursor'
import {BinOpType, EV, Expr, ExprData} from './Expr'
import {Index, IndexData} from './Index'
import {Selection} from './Selection'
import {Target} from './Target'

const {
  keys,
  entries,
  fromEntries,
  getOwnPropertyDescriptors,
  assign,
  getPrototypeOf,
  setPrototypeOf,
  getOwnPropertyDescriptor
} = Object

const {ownKeys} = Reflect

interface TableDefinition {}

export interface TableData {
  name: string
  alias?: string
  definition: TableDefinition
  columns: Record<string, ColumnData>
  meta(): {indexes: Record<string, IndexData>}
}

interface TableProto<Definition> {
  (conditions: {
    [K in keyof Definition]?: Definition[K] extends Column<infer V>
      ? EV<V>
      : never
  }): Cursor.TableSelect<Definition>
  (...conditions: Array<EV<boolean>>): Cursor.TableSelect<Definition>
}

class TableProto<Definition> {
  [Selection.__tableType](): Table.Select<Definition> {
    throw 'assert'
  }
  get [table.data](): TableData {
    throw 'assert'
  }
  [table.meta](): TableMeta {
    throw 'assert'
  }
  // Clear the Function prototype, not sure if there's a better way
  // as mapped types (Omit) will remove the callable signature. We define them
  // in a class getter since it's the only way to also mark them as non-enumarable
  // Seems open: Microsoft/TypeScript#27575
  get name(): unknown {
    throw 'assert'
  }
  get length(): unknown {
    throw 'assert'
  }
  get call(): unknown {
    throw 'assert'
  }
  get apply(): unknown {
    throw 'assert'
  }
  get bind(): unknown {
    throw 'assert'
  }
  get prototype(): unknown {
    throw 'assert'
  }
}

export type Table<Definition> = Definition & TableProto<Definition>

export namespace Table {
  export type Of<Row> = {[Selection.__tableType](): Row}

  export type Select<Definition> = {
    [K in keyof Definition as Definition[K] extends Column<any>
      ? K
      : never]: Definition[K] extends Column<infer T> ? T : never
  }

  export type Update<Definition> = Partial<{
    [K in keyof Definition as Definition[K] extends Column<any>
      ? K
      : never]: Definition[K] extends Column<infer T> ? EV<T> : never
  }>

  type IsOptional<K> = K extends PrimaryColumn<any, any>
    ? true
    : K extends OptionalColumn<any>
    ? true
    : K extends Column<infer V>
    ? null extends V
      ? true
      : false
    : never

  export type Insert<Definition> = {
    [K in keyof Definition as true extends IsOptional<Definition[K]>
      ? K
      : never]?: Definition[K] extends Column<infer V> ? EV<V> : never
  } & {
    [K in keyof Definition as false extends IsOptional<Definition[K]>
      ? K
      : never]: Definition[K] extends Column<infer V> ? EV<V> : never
  }
}

export interface TableMeta {
  indexes?: Record<string, Index>
}

type Definition<T> = {
  [K in keyof T as K extends string ? K : never]: Column<any> | (() => any)
}

interface Define<T> {
  new (): T
}

type Blueprint<T> = Definition<T> // & {[table.meta]?: () => Meta}

type DefineTable = <T extends Blueprint<T>>(define: T | Define<T>) => Table<T>

export type table<T> = T extends Table<infer D> ? Table.Select<D> : never

function keysOf(input: any) {
  const methods = []
  while ((input = getPrototypeOf(input))) {
    const keys = ownKeys(input)
    for (const key of keys) if (typeof key === 'string') methods.push(key)
  }
  return methods
}

export function createTable<Definition>(data: TableData): Table<Definition> {
  const target = Target.Table(data)
  const call = {
    [data.name]: function (...args: Array<any>) {
      const isConditionalRecord =
        args.length === 1 &&
        typeof args[0] === 'object' &&
        !(args[0] instanceof Expr)
      const conditions = isConditionalRecord
        ? entries(args[0]).map(([key, value]) => {
            const column = data.columns[key]
            if (!column) throw new Error(`Column ${key} not found`)
            return new Expr(
              ExprData.BinOp(
                BinOpType.Equals,
                ExprData.Field(ExprData.Row(target), key),
                ExprData.create(value)
              )
            )
          })
        : args
      return new Cursor.TableSelect<Definition>(data, conditions)
    }
  }[data.name]
  const cols = keys(data.columns)
  const hasKeywords = cols
    .concat(keysOf(data.definition))
    .some(name => name in Function)
  const expressions = fromEntries(
    cols.map(name => [
      name,
      new Expr(ExprData.Field(ExprData.Row(target), name))
    ])
  )
  const toExpr = () => new Expr(ExprData.Row(target))
  const ownKeys = ['prototype', ...cols]
  let res: any
  if (!hasKeywords) {
    res = assign(call, expressions, {[table.data]: data})
    setPrototypeOf(call, getPrototypeOf(data.definition))
  } else {
    function get(key: string) {
      return expressions[key] || (data.definition as any)[key]
    }
    res = new Proxy(call, {
      get(target: any, key: string | symbol) {
        if (key === table.data) return data
        if (key === Expr.toExpr) return toExpr
        return get(key as string)
      },
      ownKeys(target) {
        return ownKeys
      },
      getOwnPropertyDescriptor(target, key) {
        if (key === 'prototype') return getOwnPropertyDescriptor(target, key)
        return {
          value: get(key as string),
          enumerable: true,
          configurable: true
        }
      }
    })
  }
  return res
}

export function table<T extends Blueprint<T>>(
  define: Record<string, T | Define<T>>
): Table<T> {
  const names = keys(define)
  if (names.length !== 1) throw new Error('Table must have a single name')
  const name = names[0]
  const target = define[name]
  const definition = 'prototype' in target ? new target() : target
  const columns = definition as Record<string, Column<any>>
  const res: Table<T> = createTable({
    name,
    definition,
    columns: fromEntries(
      entries(getOwnPropertyDescriptors(columns)).map(([name, descriptor]) => {
        const column = columns[name]
        if (!(column instanceof Column))
          throw new Error(`Property ${name} is not a column`)
        const {data} = column
        return [
          name,
          {
            ...data,
            name: data.name || name,
            enumerable: descriptor.enumerable
          }
        ]
      })
    ),
    meta() {
      const createMeta = res[table.meta]
      const meta = createMeta ? createMeta.apply(res) : {}
      return {
        indexes: fromEntries(
          entries((meta?.indexes as TableMeta) || {}).map(([key, index]) => {
            const indexName = `${name}.${key}`
            return [indexName, {name: indexName, ...index.data}]
          })
        )
      }
    }
  })
  return res
}

export namespace table {
  export const data = Symbol('data')
  export const meta = Symbol('meta')
}
