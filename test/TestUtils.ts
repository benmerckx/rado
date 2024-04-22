import {Builder} from '../src/core/Builder.ts'
import {dialect} from '../src/core/Dialect.ts'
import {Emitter} from '../src/core/Emitter.ts'
import type {HasQuery, HasSql} from '../src/core/Internal.ts'

class TestEmitter extends Emitter {
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
}

const testDialect = dialect(TestEmitter)

export function emit(input: HasSql | HasQuery): string {
  return testDialect(input).sql
}

export const builder = new Builder({})
