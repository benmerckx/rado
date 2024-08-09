import {type Sql, sql} from '../Sql.ts'
import {type Input, input} from './Input.ts'

export function callFunction<Result>(
  name: Sql,
  args: Array<Input<unknown>>
): Sql<Result> {
  return sql`${name}(${sql.join(args.map(input), sql`, `)})`
}

function get(target: Record<string, Function>, method: string) {
  return (target[method] ??= (...args: Array<Input<unknown>>) => {
    return callFunction(sql.identifier(method), args)
  })
}

export const Functions = <Functions>new Proxy(Object.create(null), {get})

export type Functions = {
  [key: string]: (...args: Array<Input<any>>) => Sql<any>
}
