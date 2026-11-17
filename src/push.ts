import type {Database} from './core/Database.ts'
import {getTable, hasTable} from './core/Internal.ts'
import type {Deliver, QueryMeta, Runtime} from './core/MetaData.ts'
import {
  type Gen,
  type Planner,
  type PushOptions,
  type Step,
  exec,
  foreignKeys,
  renames
} from './core/Push.ts'
import {sql} from './core/Sql.ts'
import type {Table} from './core/Table.ts'
import {plan as mysql} from './mysql/push.ts'
import {plan as postgres} from './postgres/push.ts'
import {plan as sqlite} from './sqlite/push.ts'

export type {PushOptions} from './core/Push.ts'

export type PushInput = Array<Table> | [...Array<Table>, PushOptions]

const planners: Record<Runtime, Planner> = {sqlite, mysql, postgres}

export function push<Meta extends QueryMeta>(
  db: Database<Meta>,
  ...input: PushInput
): Deliver<Meta, void> {
  return exec(apply(db as Database, input)) as Deliver<Meta, void>
}

push.plan = function plan<Meta extends QueryMeta>(
  db: Database<Meta>,
  ...input: PushInput
): Deliver<Meta, Array<string>> {
  const {tables, options} = parse(input)
  const planner = planners[db.dialect.runtime]
  return (db as Database).transaction(tx =>
    exec(
      (function* () {
        const result: Array<string> = []
        for (const table of tables) {
          const steps = yield* planner(tx, getTable(table), options)
          result.push(...steps.map(step => step.sql))
        }
        return result
      })()
    )
  ) as Deliver<Meta, Array<string>>
}

function parse(input: PushInput) {
  const last = input.at(-1)
  const options = last && !hasTable(last) ? (last as PushOptions) : {}
  const tables = input.filter(hasTable) as Array<Table>
  for (const table of tables) {
    if (getTable(table).temporary)
      throw new Error('Temporary tables cannot be pushed')
    renames(getTable(table), options)
  }
  return {tables: order(tables), options}
}

// Referenced tables first, so foreign keys can be created
function order(tables: Array<Table>): Array<Table> {
  const byName = new Map(tables.map(table => [getTable(table).name, table]))
  const result = new Set<Table>()
  const visiting = new Set<Table>()
  const visit = (table: Table) => {
    if (result.has(table) || visiting.has(table)) return
    visiting.add(table)
    for (const fk of foreignKeys(getTable(table))) {
      const dependency = byName.get(fk.table)
      if (dependency) visit(dependency)
    }
    result.add(table)
  }
  for (const table of tables) visit(table)
  return [...result]
}

function guard(steps: Array<Step>, options: PushOptions) {
  if (options.force) return
  for (const step of steps)
    if (step.risk) throw new Error(`Push would ${step.risk}: ${step.sql}`)
}

function* apply(db: Database, input: PushInput): Gen<void> {
  const {tables, options} = parse(input)
  const runtime = db.dialect.runtime
  const planner = planners[runtime]
  const run = (batch: Array<Table>, checkKeys = false) =>
    db.transaction(tx =>
      exec(
        (function* () {
          const enforced = checkKeys && (yield* foreignKeysOn(tx))
          for (const table of batch) {
            const steps = yield* planner(tx, getTable(table), options)
            guard(steps, options)
            if (enforced && steps.some(step => step.rebuild))
              throw new Error(
                'Cannot rebuild a table while foreign keys are enforced'
              )
            if (steps.length > 0)
              yield tx.batch(steps.map(step => sql.unsafe(step.sql))).run()
          }
          if (!checkKeys) return
          const violations: Array<unknown> = yield tx.all(
            sql`pragma foreign_key_check`
          )
          if (violations.length > 0)
            throw new Error('Push would violate foreign key constraints')
        })()
      )
    )
  // MySQL commits implicitly after each DDL statement
  if (runtime === 'mysql') {
    for (const table of tables) yield run([table])
    return
  }
  if (runtime !== 'sqlite') return yield run(tables)
  // The foreign_keys pragma is a no-op inside a transaction
  const enabled = yield* foreignKeysOn(db)
  if (!enabled) return yield run(tables)
  yield db.run(sql`pragma foreign_keys = off`)
  try {
    yield run(tables, true)
  } finally {
    yield db.run(sql`pragma foreign_keys = on`)
  }
}

function* foreignKeysOn(db: Database): Gen<boolean> {
  const row: {foreign_keys: number} = yield db.get(sql`pragma foreign_keys`)
  return Boolean(row?.foreign_keys)
}
