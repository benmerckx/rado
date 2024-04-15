import {Builder} from '../core/Builder.ts'
import {dialect} from '../core/Dialect.ts'
import {Emitter} from '../core/Emitter.ts'
import type {HasQuery, HasSql} from '../core/Internal.ts'

class TestEmitter extends Emitter {
  emitValue(v: unknown) {
    this.sql += JSON.stringify(v)
  }
  emitInline(v: unknown) {
    this.sql += JSON.stringify(v)
  }
  emitJsonPath(path: Array<number | string>) {
    this.sql += `->${JSON.stringify(`$.${path.join('.')}`)}`
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
