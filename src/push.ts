import type {Database} from './core/Database.ts'
import type {Push, PushInput} from './core/Push.ts'
import {push as mysql} from './mysql/push.ts'
import {push as postgres} from './postgres/push.ts'
import {push as sqlite} from './sqlite/push.ts'

export type {PushInput, PushOptions} from './core/Push.ts'

// For universal databases whose dialect is picked at runtime, this bundles
// all three planners, a dialect entry such as rado/sqlite/push bundles one
const pushes = {sqlite, mysql, postgres}
const pick = (db: Database) => pushes[db.dialect.runtime] as Push

export const push: Push = Object.assign(
  (db: Database, ...input: PushInput) => pick(db)(db, ...input),
  {plan: (db: Database, ...input: PushInput) => pick(db).plan(db, ...input)}
) as Push
