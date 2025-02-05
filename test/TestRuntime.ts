export const isBun = 'Bun' in globalThis
export const isDeno = 'Deno' in globalThis
export const isNode = !isBun && 'process' in globalThis
// @ts-ignore
export const isCi = !isDeno && 'CI' in process.env
