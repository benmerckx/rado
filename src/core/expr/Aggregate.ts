import {getSql, type HasSql} from '../Internal.ts'
import {sql, type Sql} from '../Sql.ts'
import {distinct} from './Conditions.ts'
import {Functions} from './Functions.ts'

export function count(input?: HasSql): Sql<number> {
  return Functions.count(input ?? sql`*`).mapWith(Number)
}

export function countDistinct(input: HasSql): Sql<number> {
  return Functions.count(distinct(input)).mapWith(Number)
}

export function avg(input: HasSql): Sql<string | null> {
  return Functions.avg(input).mapWith(String)
}

export function avgDistinct(input: HasSql): Sql<string | null> {
  return Functions.avg(distinct(input)).mapWith(String)
}

export function sum(input: HasSql): HasSql<string | null> {
  return Functions.sum(input).mapWith(String)
}

export function sumDistinct(input: HasSql): HasSql<string | null> {
  return Functions.sum(distinct(input)).mapWith(String)
}

export function max<T>(input: HasSql<T>) {
  return Functions.max(input).mapWith(getSql(input))
}

export function min<T>(input: HasSql<T>) {
  return Functions.min(input).mapWith(getSql(input))
}
