import {Expr, ExprData} from './Expr'

function get(_: any, method: string) {
  return (...args: any[]) => {
    return new Expr(new ExprData.Call(method, args.map(ExprData.create)))
  }
}

export const Functions = new Proxy(Object.create(null), {get}) as Functions

export type Functions = {
  [key: string]: (...args: Array<any>) => Expr<any>
}
