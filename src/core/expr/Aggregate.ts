import {
  getResolver,
  getSql,
  hasResolver,
  type HasResolver,
  type HasSql,
  type HasTarget
} from '../Internal.ts'
import type {QueryMeta} from '../MetaData.ts'
import {SelectFirst} from '../query/Select.ts'
import {sql, type Sql} from '../Sql.ts'
import type {Scope} from '../Table.ts'
import {and, distinct} from './Conditions.ts'
import {Functions} from './Functions.ts'

export function count(input?: HasSql): Sql<number>
export function count<Meta extends QueryMeta>(
  db: HasResolver<Meta>,
  from: HasTarget | Scope | HasSql,
  ...where: Array<HasSql<boolean> | undefined>
): SelectFirst<Sql<number>, Meta>
export function count(
  input?: HasSql | HasResolver,
  from?: HasTarget | Scope | HasSql,
  ...where: Array<HasSql<boolean> | undefined>
): Sql<number> | SelectFirst<Sql<number>> {
  if (!input || !hasResolver(input))
    return Functions.count(input ?? sql`*`).mapWith(Number)
  return new SelectFirst({
    resolver: getResolver(input),
    select: count(),
    from: from as HasTarget,
    where: where.length ? and(...where) : undefined
  })
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

export function max<T>(input: HasSql<T>): Sql<T> {
  return Functions.max(input).mapWith(getSql(input))
}

export function min<T>(input: HasSql<T>): Sql<T> {
  return Functions.min(input).mapWith(getSql(input))
}
