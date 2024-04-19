import {input, type Input} from './Expr.ts'
import type {HasSql} from './Internal.ts'
import {sql} from './Sql.ts'

function get(target: Record<string, Function>, method: string) {
  return (target[method] ??= (...args: Array<Input<unknown>>) => {
    return sql`${sql.identifier(method)}(${sql.join(args.map(input), sql`, `)})`
  })
}

export const Functions = new Proxy(Object.create(null), {get}) as Functions

export type Functions = {
  [key: string]: (...args: Array<Input<unknown>>) => HasSql<unknown>
}
