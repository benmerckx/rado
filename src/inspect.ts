import type {Database} from './core/Database.ts'
import type {Inspect, InspectOptions} from './core/Inspect.ts'
import {inspect as mysql} from './mysql/inspect.ts'
import {inspect as postgres} from './postgres/inspect.ts'
import {inspect as sqlite} from './sqlite/inspect.ts'

export type * from './core/Inspect.ts'

// For universal databases whose dialect is picked at runtime, this bundles
// all three readers, a dialect entry such as rado/sqlite/inspect bundles one
const inspects = {sqlite, mysql, postgres}

export const inspect: Inspect = ((db: Database, options?: InspectOptions) =>
  (inspects[db.dialect.runtime] as Inspect)(db, options)) as Inspect
