import type {Database} from './core/Database.ts'
import {type Define, define} from './core/Order.ts'
import type {Push, PushOptions, Schema} from './core/Push.ts'
import {push as mysql} from './mysql/push.ts'
import {push as postgres} from './postgres/push.ts'
import {push as sqlite} from './sqlite/push.ts'

export type {Push, PushOptions, Schema} from './core/Push.ts'

// For universal databases whose dialect is picked at runtime, this bundles
// all three planners, a dialect entry such as rado/sqlite/push bundles one
const pushes = {sqlite, mysql, postgres}
const pick = (db: Database) => pushes[db.dialect.runtime] as Push

export const push: Push = Object.assign(
  (db: Database, schema: Schema, options?: PushOptions) =>
    pick(db)(db, schema, options),
  {
    plan: (db: Database, schema: Schema, options?: PushOptions) =>
      pick(db).plan(db, schema, options)
  }
) as Push

// Ordering doesn't depend on the dialect
export const create: Define = define(undefined, false)
export const drop: Define = define(undefined, true)
