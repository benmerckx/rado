import {ColumnData} from './Column'
import {Query} from './Query'

export interface Schema {
  name: string
  alias?: string
  columns: Record<string, ColumnData>
}

export namespace Schema {
  function cols(schema: Schema) {
    const res = new Map<string, ColumnData>()
    for (const col of Object.values(schema.columns)) res.set(col.name!, col)
    return res
  }
  export function diff(a: Schema, b: Schema): Array<Query.AlterTable> {
    const aColumns = cols(a),
      bColumns = cols(b)
    const columnNames = new Set([...aColumns.keys(), ...bColumns.keys()])
    const res: Array<Query.AlterTable> = []
    for (const columnName of columnNames) {
      const aColumn = aColumns.get(columnName),
        bColumn = bColumns.get(columnName)
      if (!aColumn) {
        res.push(Query.AlterTable({table: b, addColumn: bColumn!}))
      } else if (!bColumn) {
        res.push(Query.AlterTable({table: b, dropColumn: aColumn}))
      } else {
        const sameType = aColumn.type === bColumn.type
        const sameNullable = aColumn.nullable === bColumn.nullable
        const sameDefault =
          JSON.stringify(aColumn.defaultValue) ===
          JSON.stringify(bColumn.defaultValue)
        if (!sameType || !sameNullable || !sameDefault) {
          res.push(
            Query.AlterTable({table: b, alterColumn: [bColumn, aColumn]})
          )
        }
      }
    }
    return res
  }
}
