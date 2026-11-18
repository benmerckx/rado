import type {Database} from './Database.ts'
import type {Deliver, QueryDialect, QueryMeta, Runtime} from './MetaData.ts'
import {exec, type Gen, within} from './Push.ts'

export interface Schema {
  tables: Array<Table>
  views: Array<View>
}

export interface Table {
  schema: string
  name: string
  columns: Array<Column>
  primaryKey?: Constraint
  uniques: Array<Constraint>
  indexes: Array<Index>
  foreignKeys: Array<ForeignKey>
}

export interface Column {
  name: string
  // As the database prints it
  type: string
  notNull: boolean
  // Sql expression text
  default: string | null
  // Autoincrement, auto_increment, serial or identity
  autoIncrement: boolean
  // The expression of a generated column
  generated?: string
  // The expression a column takes on update, on MySQL
  onUpdate?: string
}

export interface Constraint {
  name?: string
  columns: Array<string>
  // The constraint as the database prints it, where it does
  definition?: string
}

export interface Index {
  name: string
  unique: boolean
  // Column names, or expression text
  columns: Array<string>
  where?: string
  // The full create statement
  definition: string
}

export type Action =
  | 'NO ACTION'
  | 'RESTRICT'
  | 'CASCADE'
  | 'SET NULL'
  | 'SET DEFAULT'

export interface ForeignKey {
  name?: string
  columns: Array<string>
  schema: string
  table: string
  references: Array<string>
  onDelete: Action
  onUpdate: Action
}

export interface View {
  schema: string
  name: string
  // The full create statement
  definition: string
}

export interface InspectOptions {
  schema?: string
}

// A dialect entry only accepts a database of its dialect
export interface Inspect<D extends QueryDialect = QueryDialect> {
  <Meta extends QueryMeta & {dialect: D}>(
    db: Database<Meta>,
    options?: InspectOptions
  ): Deliver<Meta, Schema>
}

export function createInspect<R extends Runtime>(
  runtime: R,
  read: (tx: Database, schema?: string) => Gen<Schema>,
  // Postgres reads in a savepoint, so it needs a transaction
  transact = false
): Inspect<R> {
  return ((db: Database, options: InspectOptions = {}) => {
    if (db.dialect.runtime !== runtime)
      throw new Error(`Expected a ${runtime} database`)
    const run = (tx: Database) => read(tx, options.schema)
    return exec(transact ? within(db, run, true) : run(db))
  }) as Inspect<R>
}
