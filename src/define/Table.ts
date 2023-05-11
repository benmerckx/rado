import {Callable} from '../util/Callable.js'
import {
  Column,
  ColumnData,
  ColumnType,
  OptionalColumn,
  PrimaryColumn
} from './Column.js'
import {BinOpType, EV, Expr, ExprData} from './Expr.js'
import type {Fields} from './Fields.js'
import {Index, IndexData} from './Index.js'
import {SelectFirst, TableSelect} from './Query.js'
import type {Selection} from './Selection.js'
import {Target} from './Target.js'

const {
  assign,
  keys,
  entries,
  fromEntries,
  getOwnPropertyDescriptors,
  getPrototypeOf,
  setPrototypeOf,
  defineProperty
} = Object

export class TableData {
  declare name: string
  declare alias?: string
  declare definition: {}
  declare columns: Record<string, ColumnData>
  declare meta: () => {
    primaryKey?: Array<ExprData>
    indexes: Record<string, IndexData>
  }

  constructor(data: TableData) {
    assign(this, data)
  }
}

export interface TableInstance<Definition> extends Callable {
  (conditions: {
    [K in keyof Definition]?: Definition[K] extends Expr<infer V>
      ? EV<V>
      : never
  }): TableSelect<Definition>
  (...conditions: Array<EV<boolean>>): TableSelect<Definition>
}

export declare class TableInstance<Definition> {
  [Selection.TableType](): Table.Select<Definition>
  get [Table.Data](): TableData
}

export type Table<Definition> = Definition & TableInstance<Definition>

declare class HasIndexes<Indexes extends string | number | symbol> {
  get [Table.Indexes](): Record<Indexes, IndexData>
}

export type IndexedTable<
  Definition,
  Indexes extends string | number | symbol
> = Table<Definition> & HasIndexes<Indexes>

type TableOf<Row> = Table<{
  [K in keyof Row as K extends string ? K : never]: Column<Row[K]> &
    Fields<Row[K]>
}>

type RowOf<Definition> = {
  [K in keyof Definition as Definition[K] extends Column<any>
    ? K
    : never]: Definition[K] extends Column<infer T> ? T : never
}

type UpdateOf<Definition> = Partial<{
  [K in keyof Definition as Definition[K] extends Column<any>
    ? K
    : never]: Definition[K] extends Column<infer T>
    ? EV<T> | SelectFirst<T>
    : never
}>

export namespace Table {
  export const Data = Symbol('Table.Data')
  export const Indexes = Symbol('Table.Indexes')
  export const PrimaryKey = Symbol('Table.PrimaryKey')

  export type Of<Row> = TableOf<Row>
  export type Select<Definition> = RowOf<Definition>
  export type Update<Definition> = UpdateOf<Definition>

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

interface Define<T> {
  new (): T
}

export type table<T> = Table.Select<T extends Table<infer D> ? D : T>

export function createTable<Definition>(data: TableData): Table<Definition> {
  const target = new Target.Table(data)
  const call: any = {
    [data.name]: function (...args: Array<any>) {
      const isConditionalRecord = args.length === 1 && !Expr.isExpr(args[0])
      const conditions = isConditionalRecord
        ? entries(args[0]).map(([key, value]) => {
            const column = data.columns[key]
            if (!column) throw new Error(`Column ${key} not found`)
            return new Expr(
              new ExprData.BinOp(
                BinOpType.Equals,
                new ExprData.Field(new ExprData.Row(target), key),
                ExprData.create(value)
              )
            )
          })
        : args
      return new TableSelect<Definition>(data, conditions)
    }
  }[data.name]
  const cols = keys(data.columns)
  const row = new ExprData.Row(target)
  const expressions = fromEntries(
    cols.map(name => {
      let expr = new Expr(new ExprData.Field(row, name))
      if (data.columns[name].type === ColumnType.Json)
        expr = expr.dynamic<any>()
      return [name, expr]
    })
  )
  const toExpr = () => new Expr(row)
  delete call.name
  delete call.length
  for (const [key, value] of entries(expressions))
    defineProperty(call, key, {value, enumerable: true, configurable: true})
  defineProperty(call, Table.Data, {value: data, enumerable: false})
  let indexes: Record<string, IndexData>
  defineProperty(call, Table.Indexes, {
    get() {
      if (indexes) return indexes
      return (indexes = data.meta().indexes)
    },
    enumerable: false
  })
  defineProperty(call, Expr.ToExpr, {value: toExpr, enumerable: false})
  setPrototypeOf(call, getPrototypeOf(data.definition))
  return call
}

export function table<
  T extends {},
  Indexes extends Record<string, Index>
>(define: {
  [key: string]: T | Define<T>
  [Table.Indexes]?: (this: T) => Indexes
  [Table.PrimaryKey]?: (this: T) => Array<Column<any>>
}): {} extends Indexes ? Table<T> : IndexedTable<T, keyof Indexes> {
  const names = keys(define)
  if (names.length !== 1) throw new Error('Table must have a single name')
  const name = names[0]
  const target = define[name]
  const definition = 'prototype' in target ? new target() : target
  const columns = definition as Record<string, Column<any>>
  const res: any = createTable<T>(
    new TableData({
      name,
      definition,
      columns: fromEntries(
        entries(getOwnPropertyDescriptors(columns))
          .filter(([name]) => {
            const column = columns[name]
            return Column.isColumn(column)
          })
          .map(([name, descriptor]) => {
            const column = columns[name]
            const data = column[Column.Data]
            if (!data.type) throw new Error(`Column ${name} has no type`)
            return [
              name,
              {
                ...data,
                type: data.type!,
                name: data.name || name,
                enumerable: descriptor.enumerable
              }
            ]
          })
      ),
      meta() {
        const createIndexes = define[Table.Indexes]
        const indexes: Record<string, Index> = createIndexes
          ? createIndexes.apply(res)
          : {}
        const createPrimaryKey = define[Table.PrimaryKey]
        const primaryKey = createPrimaryKey
          ? createPrimaryKey.apply(res).map(ExprData.create)
          : undefined
        return {
          primaryKey,
          indexes: fromEntries(
            entries(indexes || {}).map(([key, index]) => {
              const indexName = `${name}.${key}`
              return [key, {name: indexName, ...index.data}]
            })
          )
        }
      }
    })
  )
  return res
}

export namespace table {
  export const indexes: typeof Table.Indexes = Table.Indexes
  export const primaryKey: typeof Table.PrimaryKey = Table.PrimaryKey
}
