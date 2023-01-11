import {ExprData} from './Expr'

export enum OrderDirection {
  Asc = 'Asc',
  Desc = 'Desc'
}

export type OrderBy = {
  expr: ExprData
  order: OrderDirection
}
