import {type IsSql, isSql} from './Is.ts'
import {ContainsSql, type TypedSql, sql} from './Sql.ts'

export type Input<T = unknown> = Expr<T> | T | TypedSql<T>

export function input(value: Input): IsSql {
  if (isSql(value)) return value
  return sql.value(value)
}

export class Expr<T = unknown> extends ContainsSql {
  asc(): IsSql {
    return sql`${this} asc`
  }
  desc(): IsSql {
    return sql`${this} desc`
  }
}

export function expr<T>(sql: IsSql): Expr<T> {
  return new Expr(sql)
}

export function value<T>(value: T) {
  return expr<T>(sql.value(value))
}

export function eq<T>(left: Input<T>, right: Input<T>): Expr<boolean> {
  return expr(sql`${input(left)} = ${input(right)}`)
}

export function ne<T>(left: Input<T>, right: Input<T>): Expr<boolean> {
  return expr(sql`${input(left)} <> ${input(right)}`)
}

export function and(...conditions: Array<Input<boolean>>): Expr<boolean> {
  if (conditions.length === 0) return expr(sql`true`)
  if (conditions.length === 1) return expr(input(conditions[0]))
  return expr(sql`(${sql.join(conditions.map(input), sql.unsafe(' and '))})`)
}

export function or(...conditions: Array<Input<boolean>>): Expr<boolean> {
  if (conditions.length === 0) return expr(sql`true`)
  if (conditions.length === 1) return expr(input(conditions[0]))
  return expr(sql`(${sql.join(conditions.map(input), sql.unsafe(' or '))})`)
}

export function not(condition: Input): Expr<boolean> {
  return expr(sql`not ${input(condition)}`)
}

export function gt<T>(left: Input<T>, right: Input<T>): Expr<boolean> {
  return expr(sql`${input(left)} > ${input(right)}`)
}

export function gte<T>(left: Input<T>, right: Input<T>): Expr<boolean> {
  return expr(sql`${input(left)} >= ${input(right)}`)
}

export function lt<T>(left: Input<T>, right: Input<T>): Expr<boolean> {
  return expr(sql`${input(left)} < ${input(right)}`)
}

export function lte<T>(left: Input<T>, right: Input<T>): Expr<boolean> {
  return expr(sql`${input(left)} <= ${input(right)}`)
}

export function inArray<T>(
  left: Input<T>,
  right: Input<Array<T>>
): Expr<boolean> {
  if (Array.isArray(right)) {
    if (right.length === 0) return expr(sql`false`)
    return expr(
      sql`${input(left)} in (${sql.join(right.map(input), sql.unsafe(', '))})`
    )
  }
  return expr(sql`${input(left)} in ${input(right)}`)
}

export function notInArray<T>(
  left: Input<T>,
  right: Input<Array<T>>
): Expr<boolean> {
  if (Array.isArray(right)) {
    if (right.length === 0) return expr(sql`true`)
    return expr(
      sql`${input(left)} not in (${sql.join(right.map(input), sql`, `)})`
    )
  }
  return expr(sql`${input(left)} not in ${input(right)}`)
}

export function isNull(value: Input): Expr<boolean> {
  return expr(sql`${input(value)} is null`)
}

export function isNotNull(value: Input): Expr<boolean> {
  return expr(sql`${input(value)} is not null`)
}

export function between<T>(
  value: Input<T>,
  left: Input<T>,
  right: Input<T>
): Expr<boolean> {
  return expr(sql`${input(value)} between ${input(left)} and ${input(right)}`)
}

export function notBetween<T>(
  value: Input<T>,
  left: Input<T>,
  right: Input<T>
): Expr<boolean> {
  return expr(
    sql`${input(value)} not between ${input(left)} and ${input(right)}`
  )
}

export function like(
  left: Input<string>,
  pattern: Input<string>
): Expr<boolean> {
  return expr(sql`${input(left)} like ${input(pattern)}`)
}

export function notLike(
  value: Input<string>,
  pattern: Input<string>
): Expr<boolean> {
  return expr(sql`${input(value)} not like ${input(pattern)}`)
}

export function ilike(
  value: Input<string>,
  pattern: Input<string>
): Expr<boolean> {
  return expr(sql`${input(value)} ilike ${input(pattern)}`)
}

export function notILike(
  value: Input<string>,
  pattern: Input<string>
): Expr<boolean> {
  return expr(sql`${input(value)} not ilike ${input(pattern)}`)
}

export function arrayContains<T>(
  left: Input<Array<T>>,
  right: Input<T>
): Expr<boolean> {
  return expr(sql`${input(left)} @> ${input(right)}`)
}

export function arrayContained<T>(
  left: Input<T>,
  right: Input<Array<T>>
): Expr<boolean> {
  return expr(sql`${input(left)} <@ ${input(right)}`)
}

export function arrayOverlaps<T>(
  left: Input<Array<T>>,
  right: Input<Array<T>>
): Expr<boolean> {
  return expr(sql`${input(left)} && ${input(right)}`)
}
