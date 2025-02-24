import {
  type HasConstraint,
  type HasData,
  getData,
  getField,
  internalConstraint,
  internalData
} from './Internal.ts'
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
  implements HasData<UniqueConstraintData>, HasConstraint
{
  private declare brand: [TableName];
  [internalData]: UniqueConstraintData

  constructor(data: UniqueConstraintData) {
    this[internalData] = data
  }

  on<TableName extends string>(
    ...columns: Array<Field<unknown, TableName>>
  ): UniqueConstraint<TableName> {
    const fields = columns.map(getField)
    return new UniqueConstraint({...getData(this), fields})
  }

  nullsNotDistinct(): UniqueConstraint<TableName> {
    return new UniqueConstraint({...getData(this), nullsNotDistinct: true})
  }

  get [internalConstraint](): Sql {
    const {fields, nullsNotDistinct} = getData(this)
    return sql.join([
      sql`unique`,
      nullsNotDistinct ? sql`nulls not distinct` : undefined,
      sql`(${sql.join(
        fields.map(field => sql.identifier(field.fieldName)),
        sql`, `
      )})`
    ])
  }
}

export function unique(name?: string): UniqueConstraint {
  return new UniqueConstraint({name, fields: []})
}

export interface PrimaryKeyConstraintData extends ConstraintData {
  fields: Array<FieldData>
}

export class PrimaryKeyConstraint<TableName extends string = string>
  implements HasData<PrimaryKeyConstraintData>, HasConstraint
{
  private declare brand: [TableName];
  [internalData]: PrimaryKeyConstraintData

  constructor(public data: PrimaryKeyConstraintData) {
    this[internalData] = data
  }

  get [internalConstraint](): Sql {
    const {fields} = getData(this)
    return sql`primary key (${sql.join(
      fields.map(field => sql.identifier(field.fieldName)),
      sql`, `
    )})`
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
      fields: args[0].columns.map(getField)
    })
  return new PrimaryKeyConstraint({fields: args.map(getField)})
}

export interface ForeignKeyConstraintData extends ConstraintData {
  fields: Array<FieldData>
  references: Array<FieldData>
}

export class ForeignKeyConstraint<TableName extends string = string>
  implements HasData<ForeignKeyConstraintData>, HasConstraint
{
  private declare brand: [TableName];
  [internalData]: ForeignKeyConstraintData

  constructor(data: ForeignKeyConstraintData) {
    this[internalData] = data
  }

  references<ForeignTable extends string>(
    ...fields: Array<Field<unknown, ForeignTable>>
  ): ForeignKeyConstraint<TableName> {
    return new ForeignKeyConstraint({
      ...getData(this),
      references: fields.map(getField)
    })
  }

  get [internalConstraint](): Sql {
    const {fields, references} = getData(this)
    return sql`foreign key (${sql.join(
      fields.map(field => sql.identifier(field.fieldName)),
      sql`, `
    )}) references ${sql.identifier(references[0].targetName)} (${sql.join(
      references.map(field => sql.identifier(field.fieldName)),
      sql`, `
    )})`
  }
}

export function foreignKey<TableName extends string = string>(options: {
  name?: string
  columns: Array<Field<unknown, TableName>>
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
      fields: args[0].columns.map(getField),
      references: []
    })
  return new ForeignKeyConstraint({
    fields: args.map(getField),
    references: []
  })
}

export type Constraint =
  | UniqueConstraint
  | PrimaryKeyConstraint
  | ForeignKeyConstraint
