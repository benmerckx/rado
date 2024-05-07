import {sql, type Sql} from '../Sql.ts'
import {input, type Input} from './Input.ts'

function get(target: Record<string, Function>, method: string) {
  return (target[method] ??= (...args: Array<Input<unknown>>) => {
    return sql`${sql.identifier(method)}(${sql.join(args.map(input), sql`, `)})`
  })
}

export const Functions = <Functions>new Proxy(Object.create(null), {get})

export type Functions = {
  [key: string]: (...args: Array<Input<any>>) => Sql<any>
}
