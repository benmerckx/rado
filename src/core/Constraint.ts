import type {Field, FieldData} from './Field.ts'
import {getData, getField, internalData, type HasData} from './Internal.ts'

export interface UniqueConstraintData {
  fields: Array<FieldData>
  nullsNotDistinct?: boolean
}

export class UniqueConstraint<TableName extends string = string>
  implements HasData<UniqueConstraintData>
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
}

export function unique() {
  return new UniqueConstraint({fields: []})
}

export interface PrimaryKeyConstraintData {
  fields: Array<FieldData>
}

export class PrimaryKeyConstraint<TableName extends string = string>
  implements HasData<PrimaryKeyConstraintData>
{
  private declare brand: [TableName];
  [internalData]: PrimaryKeyConstraintData

  constructor(public data: PrimaryKeyConstraintData) {
    this[internalData] = data
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
  implements HasData<ForeignKeyConstraintData>
{
  private declare brand: [TableName];
  [internalData]: ForeignKeyConstraintData

  constructor(data: ForeignKeyConstraintData) {
    this[internalData] = data
  }

  references<ForeignTable extends string>(
    ...fields: Array<Field<unknown, ForeignTable>>
  ) {
    return new ForeignKeyConstraint({
      ...getData(this),
      references: fields.map(getField)
    })
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
