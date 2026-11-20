import type {Database} from './Database.ts'
import type {Deliver, QueryDialect, QueryMeta, Runtime} from './MetaData.ts'
import {exec, type Gen} from './Transaction.ts'

export interface SchemaInfo {
  tables: Array<TableInfo>
  views: Array<ViewInfo>
}

export interface TableInfo {
  schema: string
  name: string
  columns: Array<ColumnInfo>
  primaryKey?: ConstraintInfo
  uniques: Array<ConstraintInfo>
  indexes: Array<IndexInfo>
  foreignKeys: Array<ForeignKeyInfo>
}

export interface ColumnInfo {
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

export interface ConstraintInfo {
  name?: string
  columns: Array<string>
  // The constraint as the database prints it, where it does
  definition?: string
}

export interface IndexInfo {
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

export interface ForeignKeyInfo {
  name?: string
  columns: Array<string>
  schema: string
  table: string
  references: Array<string>
  onDelete: Action
  onUpdate: Action
}

export interface ViewInfo {
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
  ): Deliver<Meta, SchemaInfo>
}

export function createInspect<R extends Runtime>(
  runtime: R,
  read: (db: Database, schema?: string) => Gen<SchemaInfo>
): Inspect<R> {
  return ((db: Database, options: InspectOptions = {}) => {
    if (db.dialect.runtime !== runtime)
      throw new Error(`Expected a ${runtime} database`)
    return exec(read(db, options.schema))
  }) as Inspect<R>
}
