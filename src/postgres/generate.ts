import type {Database} from '../core/Database.ts'
import {type Generate, createGenerate, load} from '../core/Generate.ts'
import {sql} from '../core/Sql.ts'
import {connect} from '../driver/pglite.ts'
import {push} from './push.ts'

export type {GenerateOptions} from '../core/Generate.ts'

async function open(): Promise<Database> {
  const {PGlite} = await load(
    '@electric-sql/pglite',
    () => import('@electric-sql/pglite')
  )
  return connect(new PGlite())
}

// Push qualifies names so a temporary table can't shadow them, a migration
// file reads better without the default schema and runs under any search_path
async function tidy(db: Database): Promise<(statement: string) => string> {
  const row = await db.get(sql<{home: string}>`select current_schema() as home`)
  const home = `"${row!.home.replaceAll('"', '""')}".`
  return statement => statement.replaceAll(home, '')
}

export const generate: Generate<'postgres'> = createGenerate(push, open, tidy)
