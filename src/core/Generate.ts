import type {Database} from './Database.ts'
import type {QueryDialect, QueryMeta} from './MetaData.ts'
import {type Migrations, migrate, objects} from './Migrate.ts'
import {type Push, type Schema, type Statement, capture} from './Push.ts'
import {exec} from './Transaction.ts'

export interface GenerateOptions<D extends QueryDialect = QueryDialect> {
  rename?: Record<string, string>
  // An empty database to replay the migrations on, left open
  shadow?: Database<QueryMeta & {dialect: D}>
}

export interface Generate<D extends QueryDialect = QueryDialect> {
  (
    migrations: Migrations,
    schema: Schema,
    options?: GenerateOptions<D>
  ): Promise<string>
}

// Risks read as push errors, "drop column", a comment reads "Drops column"
function comment(risk: string): string {
  return `-- ${risk[0].toUpperCase()}${risk.replace(/^\w+/, '$&s').slice(1)}`
}

function format(statements: Array<Statement>): string {
  return statements
    .map(({sql, risk}) => `${risk ? `${comment(risk)}\n` : ''}${sql};`)
    .join('\n\n')
}

export function createGenerate<D extends QueryDialect>(
  push: Push<D>,
  open: () => Promise<Database>
): Generate<D> {
  return async (migrations, schema, options = {}) => {
    const db = (options.shadow as Database | undefined) ?? (await open())
    try {
      if ((await exec(objects(db))).length > 0)
        throw new Error('Expected an empty database')
      await migrate(db, migrations)
      const statements = await capture(push as Push, db, schema, {
        rename: options.rename
      })
      return format(statements)
    } finally {
      if (!options.shadow) await db.driver.close()
    }
  }
}

// Optional peer dependencies, loaded only when generate runs without a
// shadow
export async function load<T>(name: string, get: () => Promise<T>): Promise<T> {
  try {
    return await get()
  } catch (error) {
    throw new Error(`Install ${name} or pass a shadow database`, {cause: error})
  }
}
