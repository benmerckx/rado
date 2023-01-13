import {Expr, ExprData} from './Expr'
import {Schema} from './Schema'
import {Table} from './Table'

export enum RelationType {
  HasOne = 'HasOne',
  HasMany = 'HasMany',
  BelongsTo = 'BelongsTo',
  BelongsToMany = 'BelongsToMany'
}

export interface RelationData {
  type: RelationType
  table: Schema
  foreignKey?: ExprData
  localKey?: ExprData
}

export class Relation<T> {
  constructor(public data: RelationData) {}
}

export const relation = {
  hasOne<T>(table: Table<T>, foreignKey: Expr<any>, localKey: Expr<any>) {
    return new Relation<T>({
      type: RelationType.HasOne,
      table: table.schema(),
      foreignKey: ExprData.create(foreignKey),
      localKey: ExprData.create(localKey)
    })
  },
  hasMany(table: any) {
    return new Relation<any>({
      type: RelationType.HasMany,
      table: table.schema()
    })
  },
  belongsTo<T>(table: Table<T>, foreignKey: Expr<any>, localKey: Expr<any>) {
    return new Relation<T>({
      type: RelationType.BelongsTo,
      table: table.schema(),
      foreignKey: ExprData.create(foreignKey),
      localKey: ExprData.create(localKey)
    })
  },
  belongsToMany<T>(table: Table<T>) {
    return new Relation<T>({
      type: RelationType.BelongsToMany,
      table: table.schema()
    })
  }
}
