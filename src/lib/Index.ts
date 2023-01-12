import {Expr, ExprData} from './Expr'

interface PartialIndexData {
  on: Array<ExprData>
  where?: ExprData
}

export interface IndexData extends PartialIndexData {
  name: string
}

export class Index {
  constructor(public data: PartialIndexData) {}

  where(where: Expr<boolean>) {
    return new Index({...this.data, where: ExprData.create(where)})
  }
}

export function index(...on: Array<Expr<any>>) {
  return new Index({on: on.map(ExprData.create)})
}
