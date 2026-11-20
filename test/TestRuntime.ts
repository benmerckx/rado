export const isBun = 'Bun' in globalThis
export const isDeno = 'Deno' in globalThis
export const isNode = !isBun && 'process' in globalThis
// Drivers that connect to a database server, see docker-compose.yml
// @ts-ignore
export const testServers = !isDeno && 'TEST_SERVERS' in process.env
