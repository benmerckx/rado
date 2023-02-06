import {Column, ColumnData, PrimaryKey} from './Column'
import {Cursor} from './Cursor'
import {EV} from './Expr'
import {Index, IndexData} from './Index'

const {keys, entries, fromEntries, getOwnPropertyDescriptors} = Object

export interface TableData {
  name: string
  alias?: string
  columns: Record<string, ColumnData>
  indexes: Record<string, IndexData>
}

class TableProto {
  get [table.data](): TableData {
    throw 'assert'
  }
  get [table.meta](): Meta {
    throw 'assert'
  }
}

export type Table<Definition> = Definition &
  TableProto & {
    (...conditions: Array<EV<boolean>>): Cursor.TableSelect<
      Table.Select<Definition>
    >
    // Clear the Function prototype, not sure if there's a better way
    // as mapped types (Omit) will remove the callable signature
    // Seems open: Microsoft/TypeScript#27575
    name: unknown
    length: unknown
    call: unknown
    apply: unknown
    bind: unknown
    prototype: unknown
  }

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

  // Source: https://stackoverflow.com/a/67577722
  type Intersection<A, B> = A & B extends infer U
    ? {[P in keyof U]: EV<U[P]>}
    : never
  type OptionalKeys<T> = {
    [K in keyof T]: null extends T[K]
      ? K
      : T[K] extends Column.IsPrimary<any, any>
      ? K
      : T[K] extends Column.IsOptional<any>
      ? K
      : never
  }[keyof T]
  type RequiredKeys<T> = {
    [K in keyof T]: null extends T[K]
      ? never
      : T[K] extends Column.IsPrimary<any, any>
      ? never
      : T[K] extends Column.IsOptional<any>
      ? never
      : K
  }[keyof T]
  type Optionals<T> = {
    [K in keyof T]?: T[K] extends Column.IsOptional<infer V>
      ? V
      : T[K] extends Column.IsPrimary<infer V, infer K>
      ? PrimaryKey<V, K>
      : T[K]
  }
  export type Insert<T> = Intersection<
    Optionals<Pick<T, OptionalKeys<T>>>,
    Pick<T, RequiredKeys<T>>
  >
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

type Blueprint<T> = Definition<T> & {[table.meta]?: Meta}

type DefineTable = <T extends Blueprint<T>>(define: T | Define<T>) => Table<T>

export type table<T> = T extends Table<infer D> ? Table.Select<D> : never

function createTable<Definition>(data: TableData): Table<Definition> {
  function construct(...args: Array<any>) {
    /*if (args.length === 1 && typeof args[0] === 'object' && 'as' in args[0]) {
      const alias = args[0].as
      return createTable({...data, alias})
    }*/
    return new Cursor.TableSelect<Definition>(data, args)
  }
  const cols = keys(data.columns)
  const hasKeywords = cols.some(name => name in Function)
  const res: any = hasKeywords
    ? new Proxy(construct, {
        get(_, key: string | symbol) {
          return data.columns[key as string]
        }
      })
    : Object.assign(
        construct,
        fromEntries(cols.map(name => [name, data.columns[name]]))
      )
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
    const meta = definition[table.meta]
    return createTable({
      name: name,
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
        Object.entries(meta?.indexes || {}).map(([key, index]) => {
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
