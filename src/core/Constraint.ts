import {
  getData,
  getField,
  internalConstraint,
  internalData,
  type HasConstraint,
  type HasData
} from './Internal.ts'
import {sql} from './Sql.ts'
import type {Field, FieldData} from './expr/Field.ts'

export interface UniqueConstraintData {
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

  nullsNotDistinct() {
    return new UniqueConstraint({...getData(this), nullsNotDistinct: true})
  }

  get [internalConstraint]() {
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

export function unique() {
  return new UniqueConstraint({fields: []})
}

export interface PrimaryKeyConstraintData {
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

  get [internalConstraint]() {
    const {fields} = getData(this)
    return sql`primary key (${sql.join(
      fields.map(field => sql.identifier(field.fieldName)),
      sql`, `
    )})`
  }
}

export function primaryKey<TableName extends string = string>(
  ...fields: Array<Field<unknown, TableName>>
) {
  return new PrimaryKeyConstraint<TableName>({fields: fields.map(getField)})
}

export interface ForeignKeyConstraintData {
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

  get [internalConstraint]() {
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

export function foreignKey<TableName extends string = string>(
  ...fields: Array<Field<unknown, TableName>>
) {
  return new ForeignKeyConstraint<TableName>({
    fields: fields.map(getField),
    references: []
  })
}

export type Constraint =
  | UniqueConstraint
  | PrimaryKeyConstraint
  | ForeignKeyConstraint
