export const isBun = 'Bun' in globalThis
export const isDeno = !isBun && 'Deno' in globalThis
export const isNode = !isDeno && 'process' in globalThis
