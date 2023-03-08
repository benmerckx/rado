import {ParamData, ParamType} from '../define/Param.js'
import {Sanitizer} from './Sanitizer.js'

const SEPARATE = ', '
const WHITESPACE = ' '
const NEWLINE = '\n'
const INSERT_PARAM = '?'

export interface StatementOptions {
  skipNewlines?: boolean
}

export class Statement {
  sql: string = ''
  paramData: Array<ParamData> = []
  currentIndent = ''

  constructor(
    public sanitizer: Sanitizer,
    public options: StatementOptions = {}
  ) {}

  space() {
    if (this.sql === '') return this
    return this.raw(WHITESPACE)
  }

  add(addition: undefined | string) {
    if (!addition) return this
    return this.space().raw(addition)
  }

  addLine(addition: undefined | string) {
    if (!addition) return this
    return this.newline().raw(addition)
  }

  indent() {
    this.currentIndent = this.currentIndent + '  '
    return this
  }

  dedent() {
    this.currentIndent = this.currentIndent.slice(0, -2)
    return this
  }

  newline() {
    if (this.options.skipNewlines) return this
    return this.raw(NEWLINE + this.currentIndent)
  }

  identifier(name: string) {
    return this.raw(this.sanitizer.escapeIdentifier(name))
  }

  addIdentifier(name: string) {
    return this.space().identifier(name)
  }

  value(value: any) {
    this.paramData.push(new ParamData.Value(value))
    return this.raw(INSERT_PARAM)
  }

  addValue(value: any) {
    return this.space().value(value)
  }

  param(data: ParamData) {
    this.paramData.push(data)
    return this.raw(INSERT_PARAM)
  }

  addParam(data: ParamData) {
    return this.space().param(data)
  }

  raw(query: string) {
    if (!query) return this
    this.sql += query
    return this
  }

  openParenthesis() {
    return this.raw('(').indent().newline()
  }

  closeParenthesis() {
    return this.dedent().newline().raw(')')
  }

  *call<T>(parts: Array<T>, separator = SEPARATE) {
    if (parts.length === 0) return this.raw('()')
    this.openParenthesis()
    yield* this.separate(parts, separator)
    this.closeParenthesis()
  }

  *separate<T>(parts: Array<T>, separator = SEPARATE) {
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) this.raw(separator).newline()
      yield parts[i]
    }
  }

  isEmpty() {
    return this.sql === ''
  }

  params(input?: Record<string, any>): Array<any> {
    return this.paramData.map(param => {
      if (param.type === ParamType.Named) {
        if (input && param.name in input)
          return this.sanitizer.formatParamValue(input[param.name])
        throw new TypeError(`Missing parameter ${param.name}`)
      }
      return this.sanitizer.formatParamValue(param.value)
    })
  }

  toString() {
    return this.sql
  }
}
