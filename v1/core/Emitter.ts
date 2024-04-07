import type {FieldApi} from './Field.ts'
import type {QueryMeta} from './Query.ts'

export const emitUnsafe = Symbol()
export const emitIdentifier = Symbol()
export const emitValue = Symbol()
export const emitInline = Symbol()
export const emitJsonPath = Symbol()
export const emitPlaceholder = Symbol()
export const emitDefaultValue = Symbol()
export const emitField = Symbol()

export const emitCreate = Symbol()

export abstract class Emitter<Meta extends QueryMeta = QueryMeta> {
  sql = ''
  params: Array<unknown> = [];

  [emitUnsafe](value: string) {
    this.sql += value
  }
  [emitField](fieldApi: FieldApi) {
    fieldApi.toSql().emit(this)
  }
  abstract [emitIdentifier](value: string): void
  abstract [emitValue](value: unknown): void
  abstract [emitInline](value: unknown): void
  abstract [emitJsonPath](value: Array<number | string>): void
  abstract [emitPlaceholder](value: string): void
  abstract [emitDefaultValue](): void

  /*[emitCreate]({table, ifNotExists}: CreateData<Meta>) {
    const tableApi = getTable(table)
    sql
      .join([
        sql`create table`,
        ifNotExists ? sql`if not exists` : undefined,
        sql.identifier(tableApi.name),
        sql`(${tableApi.createColumns()})`
      ])
      .emit(this)
  }*/
}
