import {Builder} from '../src/core/Builder.ts'
import {formatColumn, type Column} from '../src/core/Column.ts'
import {Dialect} from '../src/core/Dialect.ts'
import {Emitter} from '../src/core/Emitter.ts'
import {getData, type HasQuery, type HasSql} from '../src/core/Internal.ts'
import type {DriverSpecs} from '../src/core/Driver.ts'
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
      path.target.emit(this)
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

const defaultSpecs: DriverSpecs = {
  parsesJson: false,
  supportsTransactions: true
}

export function columnSql(column: Column): string {
  return emit(formatColumn(getData(column)))
}

export function mapFrom(
  column: Column,
  value: unknown,
  specs: DriverSpecs = defaultSpecs
): unknown {
  const data = getData(column)
  return data.mapFromDriverValue ? data.mapFromDriverValue(value, specs) : value
}

export function mapTo(column: Column, value: unknown): unknown {
  const data = getData(column)
  return data.mapToDriverValue ? data.mapToDriverValue(value) : value
}
