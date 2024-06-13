import type {HasSql} from '../Internal.ts'
import {sql, type Sql} from '../Sql.ts'
import {input, type Input} from './Input.ts'

function binop(operator: string) {
  return (left: Input, right: Input): Sql<boolean> =>
    sql`${input(left)} ${sql.unsafe(operator)} ${input(right)}`
}

export const eq: <T>(left: Input<T>, right: Input<T>) => Sql<boolean> =
  binop('=')
export const ne: <T>(left: Input<T>, right: Input<T>) => Sql<boolean> =
  binop('<>')
export const gt: <T>(left: Input<T>, right: Input<T>) => Sql<boolean> =
  binop('>')
export const gte: <T>(left: Input<T>, right: Input<T>) => Sql<boolean> =
  binop('>=')
export const lt: <T>(left: Input<T>, right: Input<T>) => Sql<boolean> =
  binop('<')
export const lte: <T>(left: Input<T>, right: Input<T>) => Sql<boolean> =
  binop('<=')
export const like: (left: Input<string>, right: Input<string>) => Sql<boolean> =
  binop('like')
export const notLike: (
  left: Input<string>,
  right: Input<string>
) => Sql<boolean> = binop('not like')
export const ilike: (
  left: Input<string>,
  right: Input<string>
) => Sql<boolean> = binop('ilike')
export const notILike: (
  left: Input<string>,
  right: Input<string>
) => Sql<boolean> = binop('not ilike')
export const arrayContains: <T>(
  left: Input<Array<T>>,
  right: Input<T>
) => Sql<boolean> = binop('@>')
export const arrayContained: <T>(
  left: Input<Array<T>>,
  right: Input<Array<T>>
) => Sql<boolean> = binop('<@')
export const arrayOverlaps: <T>(
  left: Input<Array<T>>,
  right: Input<Array<T>>
) => Sql<boolean> = binop('&&')

export function and(
  ...conditions: Array<undefined | Input<boolean>>
): Sql<boolean> {
  const inputs = conditions
    .filter((v): v is Input<boolean> => v !== undefined)
    .map(input)
  if (inputs.length === 0) return sql`true`
  if (inputs.length === 1) return inputs[0]
  return sql`(${sql.join(inputs, sql` and `)})`
}

export function or(
  ...conditions: Array<undefined | Input<boolean>>
): Sql<boolean> {
  const inputs = conditions
    .filter((v): v is Input<boolean> => v !== undefined)
    .map(input)
  if (inputs.length === 0) return sql`true`
  if (inputs.length === 1) return inputs[0]
  return sql`(${sql.join(inputs, sql` or `)})`
}

export function not(condition: Input<boolean>): Sql<boolean> {
  return sql`not ${input(condition)}`
}

export function inArray<T>(
  left: Input<T>,
  right: Input<Array<T>>
): Sql<boolean> {
  if (Array.isArray(right)) {
    if (right.length === 0) return sql`false`
    return sql`${input(left)} in (${sql.join(right.map(input), sql`, `)})`
  }
  return sql`${input(left)} in ${input(right)}`
}

export function notInArray<T>(
  left: Input<T>,
  right: Input<Array<T>>
): Sql<boolean> {
  if (Array.isArray(right)) {
    if (right.length === 0) return sql`true`
    return sql`${input(left)} not in (${sql.join(right.map(input), sql`, `)})`
  }
  return sql`${input(left)} not in ${input(right)}`
}

export function isNull(value: Input): Sql<boolean> {
  return sql`${input(value)} is null`
}

export function isNotNull(value: Input): Sql<boolean> {
  return sql`${input(value)} is not null`
}

export function between<T>(
  value: Input<T>,
  left: Input<T>,
  right: Input<T>
): Sql<boolean> {
  return sql`${input(value)} between ${input(left)} and ${input(right)}`
}

export function notBetween<T>(
  value: Input<T>,
  left: Input<T>,
  right: Input<T>
): Sql<boolean> {
  return sql`${input(value)} not between ${input(left)} and ${input(right)}`
}

export function asc<T>(input: HasSql<T>): Sql {
  return sql`${input} asc`
}

export function desc<T>(input: HasSql<T>): Sql {
  return sql`${input} desc`
}

export function distinct<T>(input: HasSql<T>): Sql {
  return sql`distinct ${input}`
}

export function when<In, Out>(
  compare: Input<In>,
  ...cases: Array<[condition: Input<In>, result: Input<Out>] | Input<Out>>
): Sql<Out>
export function when<Out>(
  ...cases: Array<[condition: Input<boolean>, result: Input<Out>] | Input<Out>>
): Sql<Out>
export function when<Out, In = boolean>(
  ...cases: Array<[condition: Input<In>, result: Input<Out>] | Input<Out>>
) {
  const compare =
    cases.length > 1 && !Array.isArray(cases[0])
      ? (cases.shift() as Input<In>)
      : undefined
  return sql.join([
    sql`case`,
    compare && input(compare),
    sql.join(
      cases.map((pair, index) => {
        if (Array.isArray(pair)) {
          const [condition, result] = pair
          return sql`when ${input(condition)} then ${input(result)}`
        }
        if (index === cases.length - 1) return sql`else ${input(pair)}`
        throw new Error('Unexpected else condition')
      })
    ),
    sql`end`
  ])
}

/*
class Condition implements HasSql<boolean> {
  readonly [internalSql]: Sql<boolean>
  constructor(sql: Sql<boolean>) {
    this[internalSql] = sql
  }
  or(...conditions: Array<undefined | Input<boolean>>) {
    return new Condition(or(this, ...conditions))
  }
  eq<T>(left: Input<T>, right: Input<T>) {
    return new Condition(and(this, eq(left, right)))
  }
  ne<T>(left: Input<T>, right: Input<T>) {
    return new Condition(and(this, ne(left, right)))
  }
  gt<T>(left: Input<T>, right: Input<T>) {
    return new Condition(and(this, gt(left, right)))
  }
  gte<T>(left: Input<T>, right: Input<T>) {
    return new Condition(and(this, gte(left, right)))
  }
  lt<T>(left: Input<T>, right: Input<T>) {
    return new Condition(and(this, lt(left, right)))
  }
  lte<T>(left: Input<T>, right: Input<T>) {
    return new Condition(and(this, lte(left, right)))
  }
  like(left: Input<string>, right: Input<string>) {
    return new Condition(and(this, like(left, right)))
  }
  notLike(left: Input<string>, right: Input<string>) {
    return new Condition(and(this, notLike(left, right)))
  }
  ilike(left: Input<string>, right: Input<string>) {
    return new Condition(and(this, ilike(left, right)))
  }
  notILike(left: Input<string>, right: Input<string>) {
    return new Condition(and(this, notILike(left, right)))
  }
  arrayContains<T>(left: Input<Array<T>>, right: Input<T>) {
    return new Condition(and(this, arrayContains(left, right)))
  }
  arrayContained<T>(left: Input<Array<T>>, right: Input<Array<T>>) {
    return new Condition(and(this, arrayContained(left, right)))
  }
  arrayOverlaps<T>(left: Input<Array<T>>, right: Input<Array<T>>) {
    return new Condition(and(this, arrayOverlaps(left, right)))
  }
}

export const on = new Condition(sql`true`)*/
