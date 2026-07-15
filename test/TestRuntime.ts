export const isBun = 'Bun' in globalThis
export const isDeno = 'Deno' in globalThis
export const isNode = !isBun && 'process' in globalThis
// @ts-ignore
export const isCi = !isDeno && 'CI' in process.env

const scriptName = (isBun && Bun.env.npm_lifecycle_event) || ''
export const testMysql = !isBun || scriptName.endsWith('mysql')
export const testPostgres = !isBun || scriptName.endsWith('postgres')
export const testSqlite = !isBun || scriptName.endsWith('sqlite')
