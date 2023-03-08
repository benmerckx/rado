import {ClearFunctionProto} from '../util/Callable.js'
import {Column} from './Column.js'
import {BinOpType, EV, Expr, ExprData} from './Expr.js'
import {Fields} from './Fields.js'
import {Selection} from './Selection.js'
import {Table} from './Table.js'
import {Target} from './Target.js'
import {Select} from './query/Select.js'

const {create, entries} = Object

export interface VirtualTableInstance<Definition> extends ClearFunctionProto {
  (conditions: {
    [K in keyof Definition]?: Definition[K] extends Expr<infer V>
      ? EV<V>
      : never
  }): Select<Table.Select<Definition>>
  (...conditions: Array<EV<boolean>>): Select<Table.Select<Definition>>
}

export declare class VirtualTableInstance<Definition> {
  [Selection.TableType](): Table.Select<Definition>
  get [VirtualTable.Data](): VirtualTableData
}

export interface VirtualTableData {
  name: string
  target: Target
  select: (conditions: Array<EV<boolean>>) => Select<any>
}

export type VirtualTable<Definition> = Definition &
  VirtualTableInstance<Definition>

export namespace VirtualTable {
  export const Data = Symbol('VirtualTable.Data')

  export type Of<Row> = VirtualTable<{
    [K in keyof Row as K extends string ? K : never]: Column<Row[K]> &
      Fields<Row[K]>
  }>
}

export function createVirtualTable<Definition>(
  data: VirtualTableData
): VirtualTable<Definition> {
  const cache = create(null)
  function call(...args: Array<any>) {
    const isConditionalRecord = args.length === 1 && !Expr.isExpr(args[0])
    const conditions = isConditionalRecord
      ? entries(args[0]).map(([key, value]) => {
          return new Expr(
            new ExprData.BinOp(
              BinOpType.Equals,
              new ExprData.Field(new ExprData.Row(data.target), key),
              ExprData.create(value)
            )
          )
        })
      : args
    return data.select(conditions)
  }
  return new Proxy(<any>call, {
    get(_, column: symbol | string) {
      if (column === VirtualTable.Data) return data
      if (column === Expr.ToExpr) return new Expr(new ExprData.Row(data.target))
      if (column in cache) return cache[column]
      return (cache[column] = new Expr(
        new ExprData.Field(new ExprData.Row(data.target), <string>column)
      )).dynamic()
    }
  })
}
