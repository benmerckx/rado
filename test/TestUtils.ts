import {Builder} from '../src/core/Builder.ts'
import {Dialect} from '../src/core/Dialect.ts'
import {Emitter} from '../src/core/Emitter.ts'
import type {HasQuery, HasSql} from '../src/core/Internal.ts'
import type {QueryMeta} from '../src/core/MetaData.ts'
import type {SelectData} from '../src/index.ts'

const testDialect = new Dialect(
  class extends Emitter {
    emitValue(v: unknown) {
      this.sql += JSON.stringify(v)
    }
    emitInline(v: unknown) {
      this.sql += JSON.stringify(v)
    }
    emitJsonPath(path: Array<number | string>) {
      this.sql += `->>${JSON.stringify(`$.${path.join('.')}`)}`
    }
    emitIdentifier(identifier: string) {
      this.sql += JSON.stringify(identifier)
    }
    emitPlaceholder(name: string) {
      this.sql += `?${name}`
    }
    emitDefaultValue() {
      this.sql += 'default'
    }
    emitIdColumn(): void {
      this.sql += 'id'
    }
    emitLastInsertId(): void {
      this.sql += 'last_insert_id()'
    }
    emitInclude(data: SelectData<QueryMeta>): void {
      throw new Error('Not implemented')
    }
  }
).emit

export function emit(input: HasSql | HasQuery): string {
  return testDialect(input).sql
}

export const builder = new Builder({})
