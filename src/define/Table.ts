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
  setPrototypeOf
} = Object

interface TableDefinition {
  [table.meta]?: Meta
}

export interface TableData {
  name: string
  alias?: string
  definition: TableDefinition
  columns: Record<string, ColumnData>
  indexes: Record<string, IndexData>
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
  get [table.meta](): Meta {
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
    : false

  export type Insert<Definition> = {
    [K in keyof Definition as IsOptional<Definition[K]> extends true
      ? K
      : never]?: Definition[K] extends Column<infer V> ? EV<V> : never
  } & {
    [K in keyof Definition as IsOptional<Definition[K]> extends false
      ? K
      : never]: Definition[K] extends Column<infer V> ? EV<V> : never
  }
}

interface Meta {
  indexes?: Record<string, Index>
}

type Definition<T> = {
  [K in keyof T as K extends string ? K : never]: Column<any> | (() => any)
}

interface Define<T> {
  new (): T
}

type Blueprint<T> = Definition<T> // & {[table.meta]?: Meta}

type DefineTable = <T extends Blueprint<T>>(define: T | Define<T>) => Table<T>

export type table<T> = T extends Table<infer D> ? Table.Select<D> : never

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
  const hasKeywords = cols.some(name => name in Function)
  const expressions = fromEntries(
    cols.map(name => [
      name,
      new Expr(ExprData.Field(ExprData.Row(target), name))
    ])
  )
  const toExpr = () => new Expr(ExprData.Row(target))
  const res: any = new Proxy(call, {
    get(target: any, key: string | symbol) {
      if (key === table.data) return data
      if (key === Expr.toExpr) return toExpr
      return expressions[key as string] || (data.definition as any)[key]
    }
  })
  return res
}

export function table(templateStrings: TemplateStringsArray): DefineTable
export function table(name: string): DefineTable
export function table(input: string | TemplateStringsArray) {
  return function define<T extends Blueprint<T>>(
    define: T | Define<T>
  ): Table<T> {
    const name = typeof input === 'string' ? input : input[0]
    const definition = 'prototype' in define ? new define() : define
    const columns = definition as Record<string, Column<any>>
    const meta = (definition as any)[table.meta]
    return createTable({
      name,
      definition,
      columns: fromEntries(
        entries(getOwnPropertyDescriptors(columns)).map(
          ([name, descriptor]) => {
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
          }
        )
      ),
      indexes: Object.fromEntries(
        Object.entries((meta?.indexes as Meta) || {}).map(([key, index]) => {
          const indexName = `${name}.${key}`
          return [indexName, {name: indexName, ...index.data}]
        })
      )
    })
  }
}

export namespace table {
  export const data = Symbol('data')
  export const meta = Symbol('meta')
}
