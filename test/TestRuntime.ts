export const isBun = 'Bun' in globalThis
export const isDeno = 'Deno' in globalThis
export const isNode = !isBun && 'process' in globalThis
