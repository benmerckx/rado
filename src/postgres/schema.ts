import {
  type HasCreate,
  type HasDrop,
  internalCreate,
  internalDrop,
  internalTarget
} from '../core/Internal.ts'
import {type Sql, sql} from '../core/Sql.ts'
import type {Table, TableConfig, TableDefinition} from '../core/Table.ts'
import {table} from '../core/Table.ts'
import {
  type DefinedView,
  type QueryView,
  materializedView,
  view
} from '../core/View.ts'
import {type PgEnum, pgEnum} from './enum.ts'

export class PgSchema<SchemaName extends string> implements HasCreate, HasDrop {
  #schemaName: SchemaName

  constructor(schemaName: SchemaName) {
    this.#schemaName = schemaName
  }

  get [internalTarget](): Sql {
    return sql.identifier(this.#schemaName)
  }

  get [internalCreate](): Array<Sql> {
    return [sql`create schema if not exists ${this}`]
  }
  get [internalDrop](): Array<Sql> {
    return [sql`drop schema if exists ${this} cascade`]
  }

  table<Definition extends TableDefinition, TableName extends string>(
    tableName: TableName,
    columns: Definition,
    config?: (self: Table<Definition>) => TableConfig<TableName>
  ): Table<Definition, TableName> {
    return table(tableName, columns, config, this.#schemaName)
  }
  enum<
    const Name extends string,
    const Values extends readonly [string, ...string[]]
  >(name: Name, values: Values): PgEnum<Values> {
    return pgEnum(name, values, this.#schemaName)
  }
  view(name: string): QueryView
  view<Definition extends TableDefinition>(
    name: string,
    fields: Definition
  ): DefinedView<Definition>
  view(name: string, fields?: TableDefinition): QueryView | DefinedView<any> {
    return view(name, fields!, this.#schemaName)
  }
  materializedView(name: string): QueryView
  materializedView<Definition extends TableDefinition>(
    name: string,
    fields: Definition
  ): DefinedView<Definition>
  materializedView(
    name: string,
    fields?: TableDefinition
  ): QueryView | DefinedView<any> {
    return materializedView(name, fields!, this.#schemaName)
  }
}

export function pgSchema<SchemaName extends string>(
  schemaName: SchemaName
): PgSchema<SchemaName> {
  return new PgSchema(schemaName)
}
