import {type HasSql, getSql, getTable, hasSql, hasTable} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'

export type Input<T = unknown> = Expr<T> | Sql<T> | T

export function input<T>(value: Input<T>): HasSql<T> {
  if (typeof value !== 'object' || value === null) return sql.value(value)
  if (hasTable(value)) return sql.identifier(getTable(value).name)
  if (hasSql(value)) return getSql(value) as Sql<T>
  return sql.value(value)
}

export type Expr<Value = unknown> = HasSql<Value>

export function eq<T>(left: Input<T>, right: Input<T>): Expr<boolean> {
  return sql`${input(left)} = ${input(right)}`
}

export function ne<T>(left: Input<T>, right: Input<T>): Expr<boolean> {
  return sql`${input(left)} <> ${input(right)}`
}

export function and(...conditions: Array<Input<boolean>>): Expr<boolean> {
  if (conditions.length === 0) return sql`true`
  if (conditions.length === 1) return input(conditions[0]!)
  return sql`(${sql.join(conditions.map(input), sql.unsafe(' and '))})`
}

export function or(...conditions: Array<Input<boolean>>): Expr<boolean> {
  if (conditions.length === 0) return sql`true`
  if (conditions.length === 1) return input(conditions[0]!)
  return sql`(${sql.join(conditions.map(input), sql.unsafe(' or '))})`
}

export function not(condition: Input): Expr<boolean> {
  return sql`not ${input(condition)}`
}

export function gt<T>(left: Input<T>, right: Input<T>): Expr<boolean> {
  return sql`${input(left)} > ${input(right)}`
}

export function gte<T>(left: Input<T>, right: Input<T>): Expr<boolean> {
  return sql`${input(left)} >= ${input(right)}`
}

export function lt<T>(left: Input<T>, right: Input<T>): Expr<boolean> {
  return sql`${input(left)} < ${input(right)}`
}

export function lte<T>(left: Input<T>, right: Input<T>): Expr<boolean> {
  return sql`${input(left)} <= ${input(right)}`
}

export function inArray<T>(
  left: Input<T>,
  right: Input<Array<T>>
): Expr<boolean> {
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
): Expr<boolean> {
  if (Array.isArray(right)) {
    if (right.length === 0) return sql`true`
    return sql`${input(left)} not in (${sql.join(right.map(input), sql`, `)})`
  }
  return sql`${input(left)} not in ${input(right)}`
}

export function isNull(value: Input): Expr<boolean> {
  return sql`${input(value)} is null`
}

export function isNotNull(value: Input): Expr<boolean> {
  return sql`${input(value)} is not null`
}

export function between<T>(
  value: Input<T>,
  left: Input<T>,
  right: Input<T>
): Expr<boolean> {
  return sql`${input(value)} between ${input(left)} and ${input(right)}`
}

export function notBetween<T>(
  value: Input<T>,
  left: Input<T>,
  right: Input<T>
): Expr<boolean> {
  return sql`${input(value)} not between ${input(left)} and ${input(right)}`
}

export function like(
  left: Input<string>,
  pattern: Input<string>
): Expr<boolean> {
  return sql`${input(left)} like ${input(pattern)}`
}

export function notLike(
  value: Input<string>,
  pattern: Input<string>
): Expr<boolean> {
  return sql`${input(value)} not like ${input(pattern)}`
}

export function ilike(
  value: Input<string>,
  pattern: Input<string>
): Expr<boolean> {
  return sql`${input(value)} ilike ${input(pattern)}`
}

export function notILike(
  value: Input<string>,
  pattern: Input<string>
): Expr<boolean> {
  return sql`${input(value)} not ilike ${input(pattern)}`
}

export function arrayContains<T>(
  left: Input<Array<T>>,
  right: Input<T>
): Expr<boolean> {
  return sql`${input(left)} @> ${input(right)}`
}

export function arrayContained<T>(
  left: Input<T>,
  right: Input<Array<T>>
): Expr<boolean> {
  return sql`${input(left)} <@ ${input(right)}`
}

export function arrayOverlaps<T>(
  left: Input<Array<T>>,
  right: Input<Array<T>>
): Expr<boolean> {
  return sql`${input(left)} && ${input(right)}`
}

export function asc<T>(column: Expr<T>): Sql {
  return sql`${column} asc`
}

export function desc<T>(column: Expr<T>): Sql {
  return sql`${column} desc`
}

export interface JsonArrayExpr<Value> extends HasSql<Value> {
  [index: number]: JsonExpr<Value>
}

export type JsonRecordExpr<Row> = HasSql<Row> & {
  [K in keyof Row]: JsonExpr<Row[K]>
}

type Nullable<T> = {[P in keyof T]: T[P] | null}

export type JsonExpr<Value> = [NonNullable<Value>] extends [Array<infer V>]
  ? JsonArrayExpr<null extends Value ? V | null : V>
  : [NonNullable<Value>] extends [object]
  ? JsonRecordExpr<null extends Value ? Nullable<Value> : Value>
  : Expr<Value>

const INDEX_PROPERTY = /^\d+$/

export function dynamic<Value>(e: Expr<Value>): JsonExpr<Value> {
  return new Proxy(<any>e, {
    get(target, prop) {
      if (typeof prop !== 'string') return Reflect.get(target, prop)
      const isNumber = INDEX_PROPERTY.test(prop)
      return dynamic(sql`${target}`.jsonPath([isNumber ? Number(prop) : prop]))
    }
  })
}
