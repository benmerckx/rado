import {ExprData} from './Expr.js'

export enum OrderDirection {
  Asc = 'Asc',
  Desc = 'Desc'
}

export type OrderBy = {
  expr: ExprData
  order: OrderDirection
}
