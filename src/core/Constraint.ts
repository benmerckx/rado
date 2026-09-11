import type {Field, FieldData} from './expr/Field.ts'
import {
  type HasConstraint,
  type HasData,
  getData,
  getField,
  internalConstraint,
  internalData
} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'

export interface ConstraintData {
  name?: string
}

export interface UniqueConstraintData extends ConstraintData {
  fields: Array<FieldData>
  nullsNotDistinct?: boolean
}

export class UniqueConstraint
  implements HasData<UniqueConstraintData>, HasConstraint
{
  [internalData]: UniqueConstraintData

  constructor(data: UniqueConstraintData) {
    this[internalData] = data
  }

  on(...columns: Array<Field>): UniqueConstraint {
    const fields = columns.map(getField)
    return new UniqueConstraint({...getData(this), fields})
  }

  nullsNotDistinct(): UniqueConstraint {
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

export class PrimaryKeyConstraint
  implements HasData<PrimaryKeyConstraintData>, HasConstraint
{
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

export function primaryKey(options: {
  name?: string
  columns: Array<Field>
}): PrimaryKeyConstraint
export function primaryKey(...fields: Array<Field>): PrimaryKeyConstraint
export function primaryKey(...args: Array<any>): PrimaryKeyConstraint {
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

export class ForeignKeyConstraint
  implements HasData<ForeignKeyConstraintData>, HasConstraint
{
  [internalData]: ForeignKeyConstraintData

  constructor(data: ForeignKeyConstraintData) {
    this[internalData] = data
  }

  references(...fields: Array<Field>): ForeignKeyConstraint {
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

export function foreignKey(options: {
  name?: string
  columns: Array<Field>
  foreignColumns?: Array<Field>
}): ForeignKeyConstraint
export function foreignKey(...fields: Array<Field>): ForeignKeyConstraint
export function foreignKey(...args: Array<any>): ForeignKeyConstraint {
  if (args.length === 1 && 'columns' in args[0])
    return new ForeignKeyConstraint({
      name: args[0].name,
      fields: args[0].columns.map(getField),
      references: args[0].foreignColumns?.map(getField) ?? []
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
