import type {HasSql} from '../Internal.ts'
import {sql, type Sql} from '../Sql.ts'
import {input, type Input} from './Input.ts'

function binop(operator: string) {
  return (left: Input, right: Input): HasSql<boolean> =>
    sql`${input(left)} ${sql.unsafe(operator)} ${input(right)}`
}

export const eq: <T>(left: Input<T>, right: Input<T>) => HasSql<boolean> =
  binop('=')
export const ne: <T>(left: Input<T>, right: Input<T>) => HasSql<boolean> =
  binop('<>')
export const gt: <T>(left: Input<T>, right: Input<T>) => HasSql<boolean> =
  binop('>')
export const gte: <T>(left: Input<T>, right: Input<T>) => HasSql<boolean> =
  binop('>=')
export const lt: <T>(left: Input<T>, right: Input<T>) => HasSql<boolean> =
  binop('<')
export const lte: <T>(left: Input<T>, right: Input<T>) => HasSql<boolean> =
  binop('<=')
export const like: (
  left: Input<string>,
  right: Input<string>
) => HasSql<boolean> = binop('like')
export const notLike: (
  left: Input<string>,
  right: Input<string>
) => HasSql<boolean> = binop('not like')
export const ilike: (
  left: Input<string>,
  right: Input<string>
) => HasSql<boolean> = binop('ilike')
export const notILike: (
  left: Input<string>,
  right: Input<string>
) => HasSql<boolean> = binop('not ilike')
export const arrayContains: <T>(
  left: Input<Array<T>>,
  right: Input<T>
) => HasSql<boolean> = binop('@>')
export const arrayContained: <T>(
  left: Input<Array<T>>,
  right: Input<Array<T>>
) => HasSql<boolean> = binop('<@')
export const arrayOverlaps: <T>(
  left: Input<Array<T>>,
  right: Input<Array<T>>
) => HasSql<boolean> = binop('&&')

export function and(...conditions: Array<Input<boolean>>): HasSql<boolean> {
  if (conditions.length === 0) return sql`true`
  if (conditions.length === 1) return input(conditions[0]!)
  return sql`(${sql.join(conditions.map(input), sql.unsafe(' and '))})`
}

export function or(...conditions: Array<Input<boolean>>): HasSql<boolean> {
  if (conditions.length === 0) return sql`true`
  if (conditions.length === 1) return input(conditions[0]!)
  return sql`(${sql.join(conditions.map(input), sql.unsafe(' or '))})`
}

export function not(condition: Input<boolean>): HasSql<boolean> {
  return sql`not ${input(condition)}`
}

export function inArray<T>(
  left: Input<T>,
  right: Input<Array<T>>
): HasSql<boolean> {
  if (Array.isArray(right)) {
    if (right.length === 0) return sql`false`
    return sql`${input(left)} in (${sql.join(
      right.map(input),
      sql.unsafe(', ')
    )})`
  }
  return sql`${input(left)} in ${input(right)}`
}

export function notInArray<T>(
  left: Input<T>,
  right: Input<Array<T>>
): HasSql<boolean> {
  if (Array.isArray(right)) {
    if (right.length === 0) return sql`true`
    return sql`${input(left)} not in (${sql.join(right.map(input), sql`, `)})`
  }
  return sql`${input(left)} not in ${input(right)}`
}

export function isNull(value: Input): HasSql<boolean> {
  return sql`${input(value)} is null`
}

export function isNotNull(value: Input): HasSql<boolean> {
  return sql`${input(value)} is not null`
}

export function between<T>(
  value: Input<T>,
  left: Input<T>,
  right: Input<T>
): HasSql<boolean> {
  return sql`${input(value)} between ${input(left)} and ${input(right)}`
}

export function notBetween<T>(
  value: Input<T>,
  left: Input<T>,
  right: Input<T>
): HasSql<boolean> {
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
