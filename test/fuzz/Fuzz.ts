import type {DefineTest} from '@alinea/suite'
import * as hegel from '@hegeldev/hegel'
import * as gs from '@hegeldev/hegel/generators'
import type {IsPostgres, IsSqlite} from '#/core/MetaData.ts'
import {type Column, type Database, asc, sql, table} from '#/index.ts'
import * as universal from '#/universal/columns.ts'
import {isBun} from '../TestRuntime.ts'

type Gen<T> = gs.PrintableGenerator<T>
type ReturningDb = Database<IsPostgres | IsSqlite>

export {gs}

// @ts-ignore
const env: Record<string, string | undefined> = process.env
export const runs = Number(env.FUZZ_RUNS ?? 10)

// Bun stops a test after 5s, which a high FUZZ_RUNS easily exceeds
if (isBun) {
  const {setDefaultTimeout} = await import('bun:test')
  setDefaultTimeout(3_600_000)
}

export interface Case {
  column: Column<unknown>
  values: Gen<unknown>
  expect?(value: unknown): unknown
  same?(actual: unknown, expected: unknown): boolean
}

interface Options<T> {
  expect?(value: T): unknown
  // For values that don't round-trip exactly, such as 32 bit floats
  same?(actual: unknown, expected: unknown): boolean
}

export function field<T>(
  column: Column<T>,
  values: Gen<T>,
  options: Options<T> = {}
): Case {
  return {...(options as Options<unknown>), column, values}
}

export interface Target {
  label: string
  db: Database
  limits?: Limits
}

function plain(value: unknown): unknown {
  // pg and mysql2 return Buffers, which are Uint8Arrays to their users
  if (value instanceof Uint8Array) return new Uint8Array(value)
  return value
}

function check(
  test: DefineTest<unknown>,
  {expect, same}: Case,
  actual: Array<unknown>,
  input: Array<unknown>
) {
  const expected = input.map((value, i) => {
    if (value === null) return null
    const mapped = plain(expect ? expect(value) : value)
    return same?.(actual[i], mapped) ? actual[i] : mapped
  })
  test.equal(actual.map(plain), expected)
}

export function float32(actual: unknown, expected: unknown): boolean {
  return typeof actual === 'number' && Math.fround(actual) === expected
}

let tables = 0
const suffix = Math.random().toString(36).slice(2, 8)

export function fuzz<Context>(
  test: DefineTest<Context>,
  {label, db}: Target,
  cases: Record<string, Case>
): void {
  const runtime = db.dialect.runtime
  const returning = runtime === 'mysql' ? undefined : (db as ReturningDb)
  for (const [name, field] of Object.entries(cases)) {
    test(`${label}: ${name}`, async () => {
      const id = ++tables
      const Fuzz = table(`fuzz_values_${runtime}_${id}_${suffix}`, {
        id: universal.id(),
        value: field.column
      })
      const rows = gs.arrays(gs.optional(field.values), {
        minSize: 1,
        maxSize: 3
      })
      const writes = gs.sampledFrom(['values', 'prepared'] as const)
      await db.create(Fuzz)
      try {
        await using insert = db
          .insert(Fuzz)
          .values({value: sql.placeholder('value')})
          .prepare(`fuzz_${id}`)
        await hegel.testAsync(
          async tc => {
            const input = tc.draw(rows, 'rows')
            const write = tc.draw(writes, 'write')
            const values = input.map(value => ({value}))
            await db.delete(Fuzz)
            if (write === 'prepared')
              for (const value of input) await insert.run({value})
            else if (!returning) await db.insert(Fuzz).values(values)
            else {
              const returned = await returning
                .insert(Fuzz)
                .values(values)
                .returning(Fuzz.value)
              check(test, field, returned, input)
            }
            const selected = await db.select().from(Fuzz).orderBy(asc(Fuzz.id))
            check(
              test,
              field,
              selected.map(row => row.value),
              input
            )
          },
          {testCases: runs}
        )
      } finally {
        await db.drop(Fuzz)
      }
    })
  }
}

export function close<Context>(
  test: DefineTest<Context>,
  {label, db}: Target
): void {
  test(`${label}: close`, async () => {
    await db.driver.close()
  })
}

export function ints(min: number, max: number): Gen<number> {
  return gs.oneOf(
    gs.integers({minValue: min, maxValue: max}),
    gs.sampledFrom([min, max, 0, -0, 1, -1].filter(n => n >= min && n <= max))
  )
}

export function bigints(min: bigint, max: bigint): Gen<bigint> {
  return gs.oneOf(
    gs.bigIntegers({minValue: min, maxValue: max}),
    gs.sampledFrom(
      [min, max, 0n, 2n ** 53n, 2n ** 53n + 1n, -(2n ** 53n) - 1n].filter(
        n => n >= min && n <= max
      )
    )
  )
}

export function doubles(width: 32 | 64 = 64): Gen<number> {
  return gs.oneOf(
    gs.floats({width, allowNan: false, allowInfinity: false}),
    gs.sampledFrom([0, -0, 0.1, 1 / 3, Number.MAX_SAFE_INTEGER, 1e-300])
  )
}

// Combining mark, astral, last code point, zero width joiner and BOM
const marks = String.fromCodePoint(0x301, 0x1f600, 0x10ffff, 0x200d, 0xfeff)
const tricky = `aN ${marks}\t\n'"\\%_\`{},`

// Values a driver or database can't store, see the targets for why
export interface Limits {
  nul?: boolean
  bom?: boolean
  numbers?: boolean
}

export function strings(
  options: Limits & {minSize?: number; maxSize?: number} = {}
): Gen<string> {
  const {nul = true, bom = true, minSize, maxSize} = options
  const excludeCharacters = nul ? undefined : '\0'
  const all = gs.oneOf(
    gs.text({minSize, maxSize, excludeCharacters}),
    gs.text({
      minSize,
      maxSize,
      alphabet: nul ? `${tricky}\0` : tricky
    })
  )
  return bom ? all : all.filter(text => !text.startsWith('\uFEFF'))
}

// MySQL's blob holds up to 64KB
export function bytes(maxSize = 65_535): Gen<Uint8Array> {
  return gs.oneOf(
    gs.binary({maxSize: Math.min(64, maxSize)}),
    gs.binary({minSize: Math.min(1024, maxSize), maxSize})
  )
}

export type Json =
  | null
  | boolean
  | number
  | string
  | Array<Json>
  | {[key: string]: Json}

export function json(options: Limits = {}): Gen<Json> {
  const text = strings({...options, maxSize: 8})
  const leaf = gs.oneOf<Json>(
    gs.none(),
    gs.booleans(),
    doubles(),
    ints(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    text
  )
  const json = gs.recursive<Json>(
    leaf,
    children =>
      gs.oneOf<Json>(
        gs.arrays(children, {maxSize: 4}),
        gs
          .maps(text, children, {maxSize: 4})
          .map(map => Object.fromEntries(map))
      ),
    {maxDepth: 6}
  )
  if (options.numbers ?? true) return json
  return json.filter(value => typeof value !== 'number')
}

export function dates(min: string, max: string): Gen<Date> {
  return gs.oneOf(
    gs.temporal.jsDates({minValue: new Date(min), maxValue: new Date(max)}),
    gs.sampledFrom(
      [0, Date.parse(min), Date.parse(max)]
        .filter(time => time >= Date.parse(min) && time <= Date.parse(max))
        .map(time => new Date(time))
    )
  )
}

export function days(min: string, max: string): Gen<Date> {
  return dates(min, max).map(date => new Date(date.toISOString().slice(0, 10)))
}

export function universalCases(options: Limits = {}) {
  return {
    text: field(universal.text(), strings(options)),
    varchar: field(
      universal.varchar(undefined, {length: 5}),
      strings({...options, maxSize: 5})
    ),
    integer: field(universal.integer(), ints(-2147483648, 2147483647), {
      expect: n => n + 0
    }),
    number: field(universal.number(), doubles(), {expect: n => n + 0}),
    boolean: field(universal.boolean(), gs.booleans()),
    json: field(universal.json<Json>(), json(options), {
      expect: value => JSON.parse(JSON.stringify(value))
    }),
    jsonb: field(universal.jsonb<Json>(), json(options), {
      expect: value => JSON.parse(JSON.stringify(value))
    }),
    blob: field(universal.blob(), bytes())
  }
}
