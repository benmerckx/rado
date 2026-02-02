import {get, type HasValue} from '../Internal.ts'
import {sql, type Sql} from '../Sql.ts'
import {distinct} from './Conditions.ts'
import {Functions} from './Functions.ts'

export function count(input?: HasValue): Sql<number> {
  return Functions.count(input ?? sql`*`).mapWith(Number)
}

export function countDistinct(input: HasValue): Sql<number> {
  return Functions.count(distinct(input)).mapWith(Number)
}

export function avg(input: HasValue): Sql<string | null> {
  return Functions.avg(input).mapWith(String)
}

export function avgDistinct(input: HasValue): Sql<string | null> {
  return Functions.avg(distinct(input)).mapWith(String)
}

export function sum(input: HasValue): HasValue<string | null> {
  return Functions.sum(input).mapWith(String)
}

export function sumDistinct(input: HasValue): HasValue<string | null> {
  return Functions.sum(distinct(input)).mapWith(String)
}

export function max<T>(input: HasValue<T>): Sql<T> {
  const {value} = get(input)
  if (!value) throw new Error('Missing sql value')
  return Functions.max(input).mapWith(value as Sql<T>)
}

export function min<T>(input: HasValue<T>): Sql<T> {
  const {value} = get(input)
  if (!value) throw new Error('Missing sql value')
  return Functions.min(input).mapWith(value as Sql<T>)
}
