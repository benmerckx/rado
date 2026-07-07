export const isBun = 'Bun' in globalThis
export const isDeno = 'Deno' in globalThis
export const isNode = !isBun && 'process' in globalThis
// @ts-ignore
export const isCi = !isDeno && 'CI' in process.env

// @ts-ignore
const testEngines = isDeno ? undefined : process.env.TEST_ENGINES || undefined
const enabled = testEngines?.split(',').map((engine: string) => engine.trim())
const testAll = enabled?.includes('all')

export const testMysql = testAll || enabled?.includes('mysql') || false
export const testPostgres = testAll || enabled?.includes('postgres') || false
export const testSqlite =
  testAll || enabled === undefined || enabled.includes('sqlite')
