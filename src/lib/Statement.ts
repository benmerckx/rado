import {ParamData, ParamType} from '../define/Param.js'
import {Sanitizer} from './Sanitizer.js'

const SEPARATE = ', '
const WHITESPACE = ' '
const NEWLINE = '\n'
const INSERT_PARAM = '?'

export interface StatementOptions {
  /**
   * Do not add any newlines while composing the statement
   */
  skipNewlines?: boolean
}

/**
 * A statement is a query string builder with parameter placeholders, and a list
 * of parameter values.
 */
export class Statement {
  sql: string = ''
  paramData: Array<ParamData> = []
  currentIndent = ''

  constructor(
    public sanitizer: Sanitizer,
    public options: StatementOptions = {}
  ) {}

  /**
   * UNSAFE
   * Adds a string without applying escaping
   */
  raw(query: string) {
    if (!query) return this
    this.sql += query
    return this
  }

  /**
   * UNSAFE
   * Adds a space if the statement is not empty, and then adds the given string
   * without applying escaping
   */
  add(addition: undefined | string) {
    if (!addition) return this
    return this.space().raw(addition)
  }

  /**
   * UNSAFE
   * Adds a newline if the statement is not empty, and then adds the given
   * string without applying escaping
   */
  addLine(addition: undefined | string) {
    if (!addition) return this
    return this.newline().raw(addition)
  }

  /**
   * Adds a space if the statement is not empty
   */
  space() {
    if (this.sql === '') return this
    return this.raw(WHITESPACE)
  }

  /**
   * Increases the indentation level
   */
  indent() {
    this.currentIndent = this.currentIndent + '  '
    return this
  }

  /**
   * Decreases the indentation level
   */
  dedent() {
    this.currentIndent = this.currentIndent.slice(0, -2)
    return this
  }

  /**
   * Adds a newline
   */
  newline(spaceRequired = true) {
    if (this.options.skipNewlines)
      if (spaceRequired) return this.space()
      else return this
    return this.raw(NEWLINE + this.currentIndent)
  }

  /**
   * Adds an identifier, applies escaping
   */
  identifier(name: string) {
    return this.raw(this.sanitizer.escapeIdentifier(name))
  }

  /**
   * Adds a space if the statement is not empty, and then adds an identifier
   */
  addIdentifier(name: string) {
    return this.space().identifier(name)
  }

  /**
   * Adds a value, applies escaping
   */
  value(value: any) {
    this.paramData.push(new ParamData.Value(value))
    return this.raw(INSERT_PARAM)
  }

  /**
   * Adds a space if the statement is not empty, and then adds a value
   */
  addValue(value: any) {
    return this.space().value(value)
  }

  /**
   * Adds a parameter
   */
  param(data: ParamData) {
    this.paramData.push(data)
    return this.raw(INSERT_PARAM)
  }

  /**
   * Adds a space if the statement is not empty, and then adds a parameter
   */
  addParam(data: ParamData) {
    return this.space().param(data)
  }

  /**
   * Opens a parenthesis and indents the next line
   */
  openParenthesis() {
    return this.raw('(').indent().newline(false)
  }

  /**
   * Closes a parenthesis and dedents the next line
   */
  closeParenthesis() {
    return this.dedent().newline(false).raw(')')
  }

  /**
   * Adds parenthesis on start and end, and a seperator to the output on
   * each iteration
   */
  *call<T>(parts: Array<T>, separator = SEPARATE) {
    if (parts.length === 0) return this.raw('()')
    this.openParenthesis()
    yield* this.separate(parts, separator)
    this.closeParenthesis()
  }

  /**
   * Adds seperator to the output on each iteration
   */
  *separate<T>(parts: Array<T>, separator = SEPARATE) {
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) this.raw(separator).newline(false)
      yield parts[i]
    }
  }

  /**
   * Returns true if the statement is empty
   */
  isEmpty() {
    return this.sql === ''
  }

  /**
   * Returns the parameter values in the order they appear in the query string
   */
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

  /**
   * For debug purposes this will apply parameter values to the query string,
   * and return the result
   */
  inlineParams() {
    let index = 0
    return this.sql.replace(/\?/g, () => {
      const param = this.paramData[index]
      index++
      switch (param.type) {
        case ParamType.Named:
          return `?${param.name}`
        case ParamType.Value:
          return this.sanitizer.escapeValue(param.value)
      }
    })
  }

  toString() {
    return this.sql
  }
}
