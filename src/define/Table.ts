import {
  Column,
  ColumnData,
  ColumnType,
  OptionalColumn,
  PrimaryColumn
} from './Column'
import {BinOpType, EV, Expr, ExprData} from './Expr'
import type {Fields} from './Fields'
import {Index, IndexData} from './Index'
import type {Selection} from './Selection'
import {Target} from './Target'
import {TableSelect} from './query/TableSelect'

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

const DATA = Symbol('Table.Data')
const META = Symbol('Table.Meta')

interface TableDefinition {}

export class TableData {
  declare name: string
  declare alias?: string
  declare definition: TableDefinition
  declare columns: Record<string, ColumnData>
  declare meta: () => {indexes: Record<string, IndexData>}

  constructor(data: TableData) {
    assign(this, data)
  }
}

export interface TableInstance<Definition> {
  (conditions: {
    [K in keyof Definition]?: Definition[K] extends Expr<infer V>
      ? EV<V>
      : never
  }): TableSelect<Definition>
  (...conditions: Array<EV<boolean>>): TableSelect<Definition>
}

export declare class TableInstance<Definition> {
  [Selection.TableType](): Table.Select<Definition>
  get [DATA](): TableData

  // Clear the Function prototype, not sure if there's a better way
  // as mapped types (Omit) will remove the callable signature. We define them
  // in a class getter since it's the only way to also mark them as non-enumarable
  // Seems open: Microsoft/TypeScript#27575
  get name(): unknown
  get length(): unknown
  get call(): unknown
  get apply(): unknown
  get bind(): unknown
  get prototype(): unknown
}

export type Table<Definition> = Definition & TableInstance<Definition>

export namespace Table {
  export const Data: typeof DATA = DATA
  export const Meta: typeof META = META

  export type Of<Row> = Table<{
    [K in keyof Row as K extends string ? K : never]: Column<Row[K]> &
      Fields<Row[K]>
  }>

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

interface Define<T> {
  new (): T
}

export type table<T> = T extends Table<infer D> ? Table.Select<D> : never

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
      if (data.columns[name].type === ColumnType.Json) expr = expr.dynamic()
      return [name, expr]
    })
  )
  const toExpr = () => new Expr(row)
  delete call.name
  delete call.length
  for (const [key, value] of entries(expressions))
    defineProperty(call, key, {value, enumerable: true, configurable: true})
  defineProperty(call, DATA, {value: data, enumerable: false})
  defineProperty(call, Expr.ToExpr, {value: toExpr, enumerable: false})
  setPrototypeOf(call, getPrototypeOf(data.definition))
  return call
}

export function table<T extends {}>(
  define: Record<string, T | Define<T>>
): Table<T> {
  const names = keys(define)
  if (names.length !== 1) throw new Error('Table must have a single name')
  const name = names[0]
  const target = define[name]
  const definition = 'prototype' in target ? new target() : target
  const columns = definition as Record<string, Column<any>>
  const res: Table<T> = createTable<T>(
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
        const createMeta = (res as any)[table.meta]
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
  )
  return res
}

export namespace table {
  export const meta: typeof META = META
}
