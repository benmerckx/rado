import {Builder} from '../src/core/Builder.ts'
import {Dialect} from '../src/core/Dialect.ts'
import {Emitter} from '../src/core/Emitter.ts'
import type {HasQuery, HasSql} from '../src/core/Internal.ts'
import type {JsonPath} from '../src/core/expr/Json.ts'

const testDialect = new Dialect(
  'postgres',
  class extends Emitter {
    emitValue(v: unknown) {
      this.sql += JSON.stringify(v)
    }
    emitInline(v: unknown) {
      this.sql += JSON.stringify(v)
    }
    emitJsonPath(path: JsonPath) {
      path.target.emitTo(this)
      this.sql += `->>${JSON.stringify(`$.${path.segments.join('.')}`)}`
    }
    emitIdentifier(identifier: string) {
      this.sql += JSON.stringify(identifier)
    }
    emitPlaceholder(name: string) {
      this.sql += `?${name}`
    }
  }
).emit

export function emit(input: HasSql | HasQuery): string {
  return testDialect(input).sql
}

export const builder = new Builder({})
