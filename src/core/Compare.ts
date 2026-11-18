import type {Database} from './Database.ts'
import {isNotNull, isNull} from './expr/Conditions.ts'
import type {Shape} from './Shape.ts'
import {type Sql, sql} from './Sql.ts'
import {type Gen, result} from './Transaction.ts'

const {keys} = Object

export function* exists(
  tx: Database,
  target: Sql,
  where = sql`1 = 1`
): Gen<boolean> {
  const row = yield* result(
    tx.get(sql`select 1 as found from ${target} where ${where} limit 1`)
  )
  return Boolean(row)
}

export interface Comparison {
  tx: Database
  target: Sql
  table: string
  live: Shape
  desired: Shape
  widens: (from: string, to: string) => boolean
  // The live name of a column that is renamed in the same push
  source?: (name: string) => string
  // Why rows can't be checked, drops and narrowing then always count
  unchecked?: string
}

export interface Changes {
  // Whether the target holds rows, only queried when asked
  hasRows: () => Gen<boolean>
  dropped: Array<string>
  added: Array<string>
  changed: Array<string>
  risks: Record<string, string>
  nulls: Record<string, string>
}

// Compares columns and finds the changes that would lose data
export function* compare({
  tx,
  target,
  table,
  live,
  desired,
  widens,
  source = name => name,
  unchecked
}: Comparison): Gen<Changes> {
  let found: boolean | undefined
  const hasRows = function* () {
    return (found ??= yield* exists(tx, target))
  }
  const before = live.columns
  const after = desired.columns
  const dropped = keys(before).filter(name => !after[name])
  const added = keys(after).filter(name => !before[name])
  const changed = keys(after).filter(
    name =>
      before[name] &&
      (['type', 'notNull', 'default', 'extra'] as const).some(
        key => before[name][key] !== after[name][key]
      )
  )
  const risks: Record<string, string> = {}
  const nulls: Record<string, string> = {}
  const holds = (name: string, missing: boolean) => {
    const column = sql.identifier(source(name))
    return exists(tx, target, missing ? isNull(column) : isNotNull(column))
  }
  const loses = function* (name: string) {
    return unchecked || (yield* holds(name, false))
  }
  const note = unchecked ? ` (${unchecked})` : ''
  for (const name of added) {
    const column = after[name]
    if (
      column.notNull &&
      column.default === null &&
      !column.extra &&
      (yield* hasRows())
    )
      throw new Error(
        `Cannot add not null column "${name}" without a default to "${table}"`
      )
  }
  for (const name of dropped)
    if (yield* loses(name))
      risks[name] = `drop column "${name}"${note || ' with data'}`
  for (const name of changed) {
    const from = before[name]
    const to = after[name]
    if (
      from.type !== to.type &&
      !widens(from.type, to.type) &&
      (yield* loses(name))
    )
      risks[name] =
        `change column "${name}" from ${from.type} to ${to.type}${note}`
    if (to.notNull && !from.notNull && (yield* holds(name, true)))
      nulls[name] = `make column "${name}" not null over null values`
  }
  return {hasRows, dropped, added, changed, risks, nulls}
}
