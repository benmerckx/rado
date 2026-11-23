import type {Database} from './Database.ts'
import {isNotNull, isNull} from './expr/Conditions.ts'
import type {Shape} from './Shape.ts'
import {type Sql, sql} from './Sql.ts'
import {type Gen, result} from './Transaction.ts'

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
  // Count every column as holding values and nulls, for a database without
  // rows such as the shadow generate uses
  capture?: boolean
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

// A key added to a table that has rows fails on rows it doesn't hold, which
// generate marks
export function keyRisk(name: string, definition: string): string | undefined {
  const kind = /^primary/i.test(definition)
    ? 'primary key'
    : /^unique/i.test(definition)
      ? 'unique key'
      : undefined
  if (!kind) return
  // SQLite and MySQL don't name a primary key
  const named = name === 'primary' ? '' : ` "${name}"`
  return `add ${kind}${named}, fails on duplicates`
}

export function referenceRisk(name?: string): string {
  const named = name ? ` "${name}"` : ''
  return `add foreign key${named}, fails on rows without a match`
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
  unchecked,
  capture = false
}: Comparison): Gen<Changes> {
  let found: boolean | undefined
  const hasRows = function* () {
    return capture || (found ??= yield* exists(tx, target))
  }
  const before = live.columns
  const after = desired.columns
  const dropped = Object.keys(before).filter(name => !after[name])
  const added = Object.keys(after).filter(name => !before[name])
  const changed = Object.keys(after).filter(
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
    return capture || unchecked || (yield* holds(name, false))
  }
  const note = unchecked ? ` (${unchecked})` : ''
  const data = capture ? '' : ' with data'
  for (const name of added) {
    const column = after[name]
    if (column.notNull && column.default === null && !column.extra)
      if (capture)
        risks[name] = `add not null column "${name}" without a default`
      else if (yield* hasRows())
        throw new Error(
          `Cannot add not null column "${name}" without a default to "${table}"`
        )
  }
  for (const name of dropped)
    if (yield* loses(name)) risks[name] = `drop column "${name}"${note || data}`
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
    if (to.notNull && !from.notNull && (capture || (yield* holds(name, true))))
      nulls[name] = `make column "${name}" not null over null values`
  }
  return {hasRows, dropped, added, changed, risks, nulls}
}
