import {type HasConstraint, get, internal} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'
import type {Field, FieldData} from './expr/Field.ts'

export interface ConstraintData {
  name?: string
}

export interface UniqueConstraintData extends ConstraintData {
  fields: Array<FieldData>
  nullsNotDistinct?: boolean
}

export class UniqueConstraint<TableName extends string = string>
  implements HasConstraint
{
  private declare brand: [TableName];
  [internal]: UniqueConstraintData & {constraint: Sql}

  constructor(data: UniqueConstraintData) {
    const entry = {
      ...data,
      get constraint() {
        const {fields, nullsNotDistinct} = this as UniqueConstraintData
        return sql.join([
          sql`unique`,
          nullsNotDistinct ? sql`nulls not distinct` : undefined,
          sql`(${sql.join(
            fields.map(field => sql.identifier(field.fieldName)),
            sql`, `
          )})`
        ])
      }
    } as UniqueConstraintData & {constraint: Sql}
    this[internal] = entry
  }

  on<TableName extends string>(
    ...columns: Array<Field<unknown, TableName>>
  ): UniqueConstraint<TableName> {
    const fields = columns.map(column => get(column).field)
    return new UniqueConstraint({...get(this), fields})
  }

  nullsNotDistinct(): UniqueConstraint<TableName> {
    return new UniqueConstraint({...get(this), nullsNotDistinct: true})
  }
}

export function unique(name?: string): UniqueConstraint {
  return new UniqueConstraint({name, fields: []})
}

export interface PrimaryKeyConstraintData extends ConstraintData {
  fields: Array<FieldData>
}

export class PrimaryKeyConstraint<TableName extends string = string>
  implements HasConstraint
{
  private declare brand: [TableName];
  [internal]: PrimaryKeyConstraintData & {constraint: Sql}

  constructor(public data: PrimaryKeyConstraintData) {
    const entry = {
      ...data,
      get constraint() {
        const {fields} = this as PrimaryKeyConstraintData
        return sql`primary key (${sql.join(
          fields.map(field => sql.identifier(field.fieldName)),
          sql`, `
        )})`
      }
    } as PrimaryKeyConstraintData & {constraint: Sql}
    this[internal] = entry
  }
}

export function primaryKey<TableName extends string = string>(options: {
  name?: string
  columns: Array<Field<unknown, TableName>>
}): PrimaryKeyConstraint<TableName>
export function primaryKey<TableName extends string = string>(
  ...fields: Array<Field<unknown, TableName>>
): PrimaryKeyConstraint<TableName>
export function primaryKey<TableName extends string = string>(
  ...args: Array<any>
): PrimaryKeyConstraint<TableName> {
  if (args.length === 1 && 'columns' in args[0])
    return new PrimaryKeyConstraint({
      name: args[0].name,
      fields: args[0].columns.map((column: Field) => get(column).field)
    })
  return new PrimaryKeyConstraint({
    fields: args.map((column: Field) => get(column).field)
  })
}

export interface ForeignKeyConstraintData extends ConstraintData {
  fields: Array<FieldData>
  references: Array<FieldData>
}

export class ForeignKeyConstraint<TableName extends string = string>
  implements HasConstraint
{
  private declare brand: [TableName];
  [internal]: ForeignKeyConstraintData & {constraint: Sql}

  constructor(data: ForeignKeyConstraintData) {
    const entry = {
      ...data,
      get constraint() {
        const {fields, references} = this as ForeignKeyConstraintData
        return sql`foreign key (${sql.join(
          fields.map(field => sql.identifier(field.fieldName)),
          sql`, `
        )}) references ${sql.identifier(references[0].targetName)} (${sql.join(
          references.map(field => sql.identifier(field.fieldName)),
          sql`, `
        )})`
      }
    } as ForeignKeyConstraintData & {constraint: Sql}
    this[internal] = entry
  }

  references<ForeignTable extends string>(
    ...fields: Array<Field<unknown, ForeignTable>>
  ): ForeignKeyConstraint<TableName> {
    return new ForeignKeyConstraint({
      ...get(this),
      references: fields.map(field => get(field).field)
    })
  }
}

export function foreignKey<TableName extends string = string>(options: {
  name?: string
  columns: Array<Field<unknown, TableName>>
  foreignColumns?: Array<Field<unknown, string>>
}): ForeignKeyConstraint<TableName>
export function foreignKey<TableName extends string = string>(
  ...fields: Array<Field<unknown, TableName>>
): ForeignKeyConstraint<TableName>
export function foreignKey<TableName extends string = string>(
  ...args: Array<any>
): ForeignKeyConstraint<TableName> {
  if (args.length === 1 && 'columns' in args[0])
    return new ForeignKeyConstraint({
      name: args[0].name,
      fields: args[0].columns.map((column: Field) => get(column).field),
      references:
        args[0].foreignColumns?.map((column: Field) => get(column).field) ?? []
    })
  return new ForeignKeyConstraint({
    fields: args.map((field: Field) => get(field).field),
    references: []
  })
}

export type Constraint =
  | UniqueConstraint
  | PrimaryKeyConstraint
  | ForeignKeyConstraint
