import {Expr, ExprData} from './Expr'

function get(target: Record<string, Function>, method: string) {
  if (method in target) return target[method]
  return (target[method] = (...args: any[]) => {
    return new Expr(new ExprData.Call(method, args.map(ExprData.create)))
  })
}

export const Functions = new Proxy(Object.create(null), {get}) as Functions

export type Functions = {
  [key: string]: (...args: Array<any>) => Expr<any>
}
