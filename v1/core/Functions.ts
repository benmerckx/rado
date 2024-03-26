import {type Expr, type Input, expr, input} from './Expr.ts'
import {sql} from './Sql.ts'

function get(target: Record<string, Function>, method: string) {
  // biome-ignore lint/suspicious/noAssignInExpressions:
  return (target[method] ??= (...args: Array<Input<unknown>>) => {
    return expr(
      sql`${sql.identifier(method)}(${sql.join(args.map(input), sql`, `)})`
    )
  })
}

export const Functions = new Proxy(Object.create(null), {get}) as Functions

export type Functions = {
  [key: string]: (...args: Array<Input<unknown>>) => Expr<unknown>
}
