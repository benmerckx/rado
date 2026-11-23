import {type Migrate, createMigrate} from './core/Migrate.ts'
import {migrator as mysql} from './mysql/migrate.ts'
import {migrator as postgres} from './postgres/migrate.ts'
import {migrator as sqlite} from './sqlite/migrate.ts'

export type {Migrate, MigrateOptions, Migrations} from './core/Migrate.ts'

const migrators = {sqlite, postgres, mysql}

export const migrate: Migrate = createMigrate(
  db => migrators[db.dialect.runtime]
)
