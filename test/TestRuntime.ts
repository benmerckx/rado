export const isBun = 'Bun' in globalThis
export const isDeno = 'Deno' in globalThis
export const isNode = !isBun && 'process' in globalThis
// @ts-ignore
export const isCi = !isDeno && 'CI' in process.env

const scriptName =
  (typeof process === 'object' && process.env.npm_lifecycle_event) || ''
const testAll = Boolean(typeof process === 'object' && process.env.TEST_ENGINES)
export const testMysql = testAll || scriptName.endsWith('mysql')
export const testPostgres = testAll || scriptName.endsWith('postgres')
export const testSqlite = testAll || scriptName.endsWith('sqlite')
