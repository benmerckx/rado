import {
  getExpr,
  getTable,
  hasExpr,
  hasTable,
  internal,
  type HasExpr
} from './Internal.ts'
import {isSql, sql, type Sql} from './Sql.ts'

export type Input<T = unknown> = Expr<T> | Sql<T> | T

export function input<T>(value: Input<T>): Sql<T> {
  if (typeof value !== 'object' || value === null) return sql.value(value)
  if (hasTable(value)) return sql.identifier(getTable(value).name)
  if (hasExpr(value)) return getExpr(value) as Sql<T>
  if (isSql(value)) return value
  return sql.value(value)
}

export class Expr<T = unknown> implements HasExpr {
  readonly [internal.expr]: Sql<T>
  constructor(readonly inner: Sql<T>) {
    this[internal.expr] = inner
  }

  asc(): Sql {
    return sql`${this} asc`
  }
  desc(): Sql {
    return sql`${this} desc`
  }
}

export function expr<T>(sql: Sql<T>): Expr<T> {
  return new Expr(sql)
}

export function eq<T>(left: Input<T>, right: Input<T>): Expr<boolean> {
  return expr(sql`${input(left)} = ${input(right)}`)
}

export function ne<T>(left: Input<T>, right: Input<T>): Expr<boolean> {
  return expr(sql`${input(left)} <> ${input(right)}`)
}

export function and(...conditions: Array<Input<boolean>>): Expr<boolean> {
  if (conditions.length === 0) return expr(sql`true`)
  if (conditions.length === 1) return expr(input(conditions[0]!))
  return expr(sql`(${sql.join(conditions.map(input), sql.unsafe(' and '))})`)
}

export function or(...conditions: Array<Input<boolean>>): Expr<boolean> {
  if (conditions.length === 0) return expr(sql`true`)
  if (conditions.length === 1) return expr(input(conditions[0]!))
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
